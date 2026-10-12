package server

import (
	"context"
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/frankbardon/pulse"
)

// LabelTablesDirName is the directory a casebook keeps its `labels`
// lookup tables in. The CLI walkthroughs export
// PULSE_LABEL_TABLES_DIR=./labels from the case directory (see
// showcase/brand-tracker/run.sh); the studio serves many cases from one
// process, so it finds the table directory per request instead: the
// nearest labels/ directory at or above the request's own directory,
// inside the workspace.
const LabelTablesDirName = "labels"

// EngineFactory builds a Pulse engine whose LabelTables are loaded from
// labelTablesDir (an absolute directory inside the workspace).
type EngineFactory func(labelTablesDir string) (*pulse.Pulse, error)

// labelEngines caches one engine per label-tables directory, rebuilt
// when the directory's table files change (name, size or mtime).
type labelEngines struct {
	mu      sync.Mutex
	engines map[string]labelEngine // abs labels dir → engine
}

type labelEngine struct {
	stamp  string
	engine *pulse.Pulse
}

// labelTablesDir returns the absolute labels/ directory serving the
// request at the root-relative requestPath, or "" when there is none.
// Candidates are <dir>/labels for the request's directory and each
// ancestor up to the root; the nearest existing one wins. Every
// candidate is scoped, so a labels symlink leading out of the workspace
// is ignored.
func (s *Server) labelTablesDir(requestPath string) string {
	rel, ok := normalizeRel(requestPath)
	if !ok {
		return ""
	}
	dir := path.Dir(rel)
	for {
		cand := LabelTablesDirName
		if dir != "." && dir != "" {
			cand = dir + "/" + LabelTablesDirName
		}
		if abs, err := s.root.Resolve(cand); err == nil {
			if info, err := os.Stat(abs); err == nil && info.IsDir() {
				return abs
			}
		}
		if dir == "." || dir == "" {
			return ""
		}
		dir = path.Dir(dir)
	}
}

// tableStamp fingerprints the table files of dir and checks each stays
// inside the workspace (a symlinked table file pointing outside makes
// the whole directory unusable: the engine would read it unscoped).
func (s *Server) tableStamp(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(s.root.Dir(), dir)
	if err != nil {
		return "", err
	}
	var parts []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		abs, err := s.root.Resolve(filepath.ToSlash(filepath.Join(rel, name)))
		if err != nil {
			return "", fmt.Errorf("label table %s: %w", name, err)
		}
		info, err := os.Stat(abs)
		if err != nil {
			return "", err
		}
		if !info.Mode().IsRegular() {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s|%d|%d", name, info.Size(), info.ModTime().UnixNano()))
	}
	sort.Strings(parts)
	return strings.Join(parts, ";"), nil
}

// engineFor returns the engine that runs the request at the
// root-relative requestPath: one with the case's label tables
// registered when a labels/ directory serves it, else the shared engine.
// A labels directory that fails to load (bad JSON, escaping symlink) is
// logged and the shared engine is used, so the engine's own "table not
// registered" refusal still names the problem.
func (s *Server) engineFor(requestPath string) *pulse.Pulse {
	dir := s.labelTablesDir(requestPath)
	if dir == "" {
		return s.engine
	}
	stamp, err := s.tableStamp(dir)
	if err != nil {
		log.Printf("studio: label tables %s: %v", dir, err)
		return s.engine
	}
	s.labels.mu.Lock()
	defer s.labels.mu.Unlock()
	if got, ok := s.labels.engines[dir]; ok && got.stamp == stamp {
		return got.engine
	}
	newEngine := s.cfg.NewEngine
	if newEngine == nil {
		newEngine = func(d string) (*pulse.Pulse, error) {
			return pulse.New(pulse.Options{DataDir: s.root.Dir(), LabelTablesDir: d})
		}
	}
	eng, err := newEngine(dir)
	if err != nil {
		log.Printf("studio: label tables %s: %v", dir, err)
		return s.engine
	}
	if s.labels.engines == nil {
		s.labels.engines = map[string]labelEngine{}
	}
	s.labels.engines[dir] = labelEngine{stamp: stamp, engine: eng}
	return eng
}

// labelStamp identifies the label tables a request runs with, for the
// preview cache key ("" when none).
func (s *Server) labelStamp(requestPath string) string {
	dir := s.labelTablesDir(requestPath)
	if dir == "" {
		return ""
	}
	stamp, err := s.tableStamp(dir)
	if err != nil {
		return ""
	}
	return dir + "#" + stamp
}

type engineKey struct{}

// withEngine carries the engine a preview job runs on through the
// scheduler to its RunFunc.
func withEngine(ctx context.Context, eng *pulse.Pulse) context.Context {
	return context.WithValue(ctx, engineKey{}, eng)
}

// engineFrom is the engine stored by withEngine, else fallback.
func engineFrom(ctx context.Context, fallback *pulse.Pulse) *pulse.Pulse {
	if eng, ok := ctx.Value(engineKey{}).(*pulse.Pulse); ok && eng != nil {
		return eng
	}
	return fallback
}
