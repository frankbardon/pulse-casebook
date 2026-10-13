package server

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/frankbardon/pulse-casebook/studio/internal/library"
	"github.com/frankbardon/pulse-casebook/studio/internal/promote"
)

const promotePath = "/api/cohorts/promote"

type promoteBody struct {
	promote.Request
	// DryRun: answer with the plan, change nothing.
	DryRun bool `json:"dry_run"`
	// PlanID, when given, must match the current plan (the one shown).
	PlanID string `json:"plan_id"`
}

// handlePromote is POST /api/cohorts/promote {workspace, kind: cohort |
// schema, name, new_name?, schema_name?, dry_run?, plan_id?}: makes a
// workspace-local cohort (with its Pulse sidecars, import spec, uploaded
// source and local schema) or a local schema global (internal/promote).
// There is no way back: nothing moves a global item into a workspace.
//
// dry_run → 200 promote.Plan {plan_id, kind, workspace, item {kind,
// name, global_name, path, global_path, ref_path, action}, schema?,
// moves [{from, to, kind, action: move|merge}], rewrites [{path, from?,
// changes [{pointer, field, old, new, resolved?}]}], warnings, commits
// {workspace, global}, counts}. Otherwise the promotion runs (every other
// request waits) → 200 {plan_id, kind, workspace, item, schema?, moved,
// rewritten, commits {workspace?, global?}, warnings}.
//
// Errors: invalid_json/missing_workspace/invalid_kind/invalid_name
// 400 (details {field}), not_promotable 400 (already global, outside
// cohorts/), workspace_not_found/not_found 404, legacy_folder 409 (no
// global area until migrated), name_clash 409 (details {item, name,
// existing, field, suggested}: retry with that field), plan_changed 409
// (details {plan}), interrupted 409, promotion_failed 500 (details
// {phase, rolled_back}).
func (l *Library) handlePromote(w http.ResponseWriter, r *http.Request) {
	var body promoteBody
	if !decodeBody(w, r, &body) {
		return
	}
	if l.lib.Legacy() {
		WriteError(w, http.StatusConflict, "legacy_folder", promote.ErrLegacy.Error(), nil)
		return
	}
	if strings.TrimSpace(body.Workspace) == "" {
		WriteError(w, http.StatusBadRequest, "missing_workspace", "workspace is required", nil)
		return
	}
	if body.DryRun {
		l.gate.RLock()
		defer l.gate.RUnlock()
		plan, err := promote.MakePlan(r.Context(), l.lib, body.Request)
		if err != nil {
			writePromoteError(w, body.Workspace, err)
			return
		}
		WriteJSON(w, http.StatusOK, plan)
		return
	}
	l.gate.Lock()
	defer l.gate.Unlock()
	if next := l.next.Load(); next != nil {
		next.ServeHTTP(w, r)
		return
	}
	area, err := l.area(body.Workspace)
	if err != nil {
		writeAreaError(w, body.Workspace, err)
		return
	}
	// A promotion must not stop half way because the client went away.
	ctx := context.WithoutCancel(r.Context())
	res, err := promote.Apply(ctx, l.lib, body.Request, promote.ApplyOptions{
		PlanID: body.PlanID, WorkspaceRepo: area.cfg.History, GlobalRepo: l.global, Logf: l.opts.Logf, Now: l.opts.Now,
	})
	if err != nil {
		writePromoteError(w, body.Workspace, err)
		return
	}
	WriteJSON(w, http.StatusOK, res)
}

func writePromoteError(w http.ResponseWriter, ws string, err error) {
	var invalid *promote.InvalidError
	var missing *promote.NotFoundError
	var clash *promote.ClashError
	var changed *promote.PlanChangedError
	var failed *promote.FailedError
	switch {
	case errors.Is(err, promote.ErrLegacy):
		WriteError(w, http.StatusConflict, "legacy_folder", err.Error(), nil)
	case errors.Is(err, library.ErrNotFound):
		writeAreaError(w, ws, err)
	case errors.Is(err, promote.ErrBadKind):
		WriteError(w, http.StatusBadRequest, "invalid_kind", err.Error(), map[string]any{"field": "kind"})
	case errors.As(err, &invalid):
		WriteError(w, http.StatusBadRequest, invalid.Code, invalid.Message, map[string]any{"field": invalid.Field})
	case errors.As(err, &missing):
		WriteError(w, http.StatusNotFound, "not_found", missing.Error(), map[string]any{"kind": missing.Kind, "path": missing.Path, "workspace": ws})
	case errors.As(err, &clash):
		WriteError(w, http.StatusConflict, "name_clash", clash.Error(), map[string]any{
			"item": clash.Item, "name": clash.Name, "existing": clash.Existing, "field": clash.Field, "suggested": clash.Suggested})
	case errors.As(err, &changed):
		WriteError(w, http.StatusConflict, "plan_changed", changed.Error(), map[string]any{"plan": changed.Plan})
	case errors.Is(err, promote.ErrInterrupted):
		WriteError(w, http.StatusConflict, "interrupted", err.Error(), nil)
	case errors.As(err, &failed):
		WriteError(w, http.StatusInternalServerError, "promotion_failed", failed.Error(),
			map[string]any{"phase": failed.Phase, "rolled_back": failed.RolledBack})
	default:
		WriteError(w, http.StatusInternalServerError, "promotion_failed", err.Error(), map[string]any{"rolled_back": false})
	}
}
