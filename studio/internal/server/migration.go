package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
	"github.com/frankbardon/pulse-casebook/studio/internal/migrate"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

const migrationApplyPath = "/api/migration/apply"

// migrationOptions are the migrate options of this server.
func (l *Library) migrationOptions() migrate.Options {
	return migrate.Options{NoGit: l.opts.NoGit, Git: l.opts.Git, Logf: l.opts.Logf}
}

type planBody struct {
	*migrate.Plan
	// Recovered: what startup did with an interrupted migration.
	Recovered *migrate.Outcome `json:"recovered,omitempty"`
}

// handleMigrationPlan is GET /api/migration/plan: what migrating this
// legacy folder to the library layout would do (migrate.Plan: every
// move with its kind, every rewritten reference, files created,
// warnings, conflicts, repositories, counts, plan_id). A folder that
// cannot be migrated answers 200 with migratable:false and a reason:
// already_library, no_git (--no-git: never migrated), not_legacy,
// inside_repository (part of an enclosing repository, e.g. a casebook
// showcase/ directory), git_link, conflicts, too_many_files,
// interrupted. recovered reports an interrupted migration startup
// resumed or rolled back.
func (l *Library) handleMigrationPlan(w http.ResponseWriter, r *http.Request) {
	plan, err := migrate.MakePlan(r.Context(), l.lib.Dir(), l.migrationOptions())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "plan_failed", err.Error(), nil)
		return
	}
	WriteJSON(w, http.StatusOK, planBody{Plan: plan, Recovered: l.opts.Recovered})
}

type applyBody struct {
	PlanID string `json:"plan_id"`
}

type applyResult struct {
	*migrate.Result
	Mode library.Mode `json:"mode"`
	// RestartRequired: the folder was migrated but this server could
	// not switch to it; restart the studio.
	RestartRequired bool            `json:"restart_required"`
	Git             *history.Status `json:"git,omitempty"`
}

// handleMigrationApply is POST /api/migration/apply {plan_id?}: migrates
// the legacy folder (plan_id, when given, must match the current plan),
// then serves it as a library from the next request on: no restart.
// Every other request waits while it runs.
//
// 200 {plan_id, workspace, moved, rewritten, commit?, warnings, mode:
// "library", restart_required, git? (global repository)}. Errors:
// invalid_json 400; not_migratable 409 (details {reason, message,
// plan}); plan_changed 409 (details {plan}: show it again);
// migration_failed 500 (details {phase, rolled_back, restart_required}:
// rolled back, or the journal finishes it on the next start).
func (l *Library) handleMigrationApply(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, workspace.MaxRequestBytes+1))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return
	}
	var body applyBody
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
			return
		}
	}
	l.gate.Lock()
	defer l.gate.Unlock()
	if next := l.next.Load(); next != nil {
		// Already migrated by an earlier request: the new library answers.
		next.ServeHTTP(w, r)
		return
	}
	// The migration must not stop half way because the client went away.
	ctx := context.WithoutCancel(r.Context())
	res, err := migrate.Apply(ctx, l.lib.Dir(), migrate.ApplyOptions{Options: l.migrationOptions(), PlanID: body.PlanID, Now: l.opts.Now})
	var notOK *migrate.NotMigratableError
	var changed *migrate.PlanChangedError
	var failed *migrate.FailedError
	switch {
	case errors.As(err, &notOK):
		WriteError(w, http.StatusConflict, "not_migratable", notOK.Plan.Message,
			map[string]any{"reason": notOK.Plan.Reason, "message": notOK.Plan.Message, "plan": notOK.Plan})
		return
	case errors.As(err, &changed):
		WriteError(w, http.StatusConflict, "plan_changed", changed.Error(), map[string]any{"plan": changed.Plan})
		return
	case errors.As(err, &failed):
		WriteError(w, http.StatusInternalServerError, "migration_failed", failed.Error(),
			map[string]any{"phase": failed.Phase, "rolled_back": failed.RolledBack, "restart_required": !failed.RolledBack})
		return
	case err != nil:
		WriteError(w, http.StatusInternalServerError, "migration_failed", err.Error(), map[string]any{"rolled_back": false, "restart_required": false})
		return
	}
	out := applyResult{Result: res, Mode: library.ModeLibrary}
	if next, err := l.reopen(ctx); err != nil {
		l.opts.Logf("migrate: switch to the library: %v (restart the studio)", err)
		out.RestartRequired = true
	} else {
		l.next.Store(next)
		st := next.global.Status()
		out.Git = &st
	}
	WriteJSON(w, http.StatusOK, out)
}

// reopen builds the handler of the migrated folder (the global
// repository is initialised here).
func (l *Library) reopen(ctx context.Context) (*Library, error) {
	lib, err := library.Open(l.lib.Dir())
	if err != nil {
		return nil, err
	}
	if lib.Legacy() {
		return nil, errors.New("the folder is still a legacy folder")
	}
	opts := l.opts
	opts.Recovered = nil
	return NewLibrary(ctx, lib, opts, l.uiFS, l.uiBuilt)
}
