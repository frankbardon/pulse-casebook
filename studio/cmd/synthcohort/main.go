// Command synthcohort writes Pulse cohorts generated from committed synth
// specs with fixed seeds. The Playwright suite uses it to build its temp
// workspaces (cohorts are gitignored, so tests never depend on a
// developer's local build):
//
//	synthcohort [-rows N] <spec> <out.pulse> <seed> [<spec> <out.pulse> <seed> ...]
//
// -rows overrides every spec's row_count (0 keeps the spec's own).
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/frankbardon/pulse/synth"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "synthcohort:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	fset := flag.NewFlagSet("synthcohort", flag.ContinueOnError)
	rows := fset.Int("rows", 0, "row count for every cohort (0 keeps the spec's row_count)")
	if err := fset.Parse(args); err != nil {
		return err
	}
	rest := fset.Args()
	if len(rest) == 0 || len(rest)%3 != 0 {
		return errors.New("usage: synthcohort [-rows N] <spec> <out.pulse> <seed> [...]")
	}
	for i := 0; i < len(rest); i += 3 {
		seed, err := strconv.ParseInt(rest[i+2], 10, 64)
		if err != nil {
			return fmt.Errorf("seed %q: %w", rest[i+2], err)
		}
		if err := write(rest[i], rest[i+1], seed, *rows); err != nil {
			return err
		}
	}
	return nil
}

func write(specPath, out string, seed int64, rows int) error {
	raw, err := os.ReadFile(specPath)
	if err != nil {
		return err
	}
	spec, err := synth.ParseSpec(raw)
	if err != nil {
		return fmt.Errorf("%s: %w", specPath, err)
	}
	if rows > 0 {
		spec.RowCount = rows
	}
	data, _, err := synth.SynthBytes(spec, synth.Options{Seed: seed})
	if err != nil {
		return fmt.Errorf("%s: %w", specPath, err)
	}
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return err
	}
	return os.WriteFile(out, data, 0o644)
}
