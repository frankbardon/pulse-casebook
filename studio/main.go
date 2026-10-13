// Command studio serves Pulse Studio, a local visual request builder, for
// one directory of Pulse requests and cohorts.
//
//	studio <dir> [--port N] [--preview-timeout 10s] [--auto-preview-rows 1000000] [--no-git] [--max-upload 2GiB]
//
// The directory is kept in git (see internal/history): every studio write
// is committed, unless --no-git is given or git is not installed.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/server"
	"github.com/frankbardon/pulse-casebook/studio/web"
)

const defaultPort = 4317

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "studio:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	fset := flag.NewFlagSet("studio", flag.ContinueOnError)
	port := fset.Int("port", defaultPort, "localhost port to listen on (0 picks a free port)")
	timeout := fset.Duration("preview-timeout", 10*time.Second, "hard timeout for a single preview probe")
	autoRows := fset.Int64("auto-preview-rows", 1_000_000, "cohort row count above which expensive previews wait for \"Run to here\"")
	noGit := fset.Bool("no-git", false, "do not keep the directory in git (no auto-commit, no history)")
	maxUpload := sizeFlag(server.DefaultMaxUpload)
	fset.Var(&maxUpload, "max-upload", "largest source file an upload may be (bytes, or with KB/MB/GB/KiB/MiB/GiB)")
	fset.Usage = func() {
		fmt.Fprintln(fset.Output(), "usage: studio <dir> [--port N] [--preview-timeout D] [--auto-preview-rows N] [--no-git] [--max-upload SIZE]")
		fset.PrintDefaults()
	}
	// Accept flags before or after the directory argument.
	var positional []string
	for len(args) > 0 {
		if err := fset.Parse(args); err != nil {
			return err
		}
		args = fset.Args()
		if len(args) > 0 {
			positional = append(positional, args[0])
			args = args[1:]
		}
	}
	if len(positional) != 1 {
		fset.Usage()
		return errors.New("expected exactly one directory argument")
	}

	root, err := scope.New(positional[0])
	if err != nil {
		return err
	}
	// One engine instance for the whole process; cohort paths in requests
	// resolve against the scoped directory.
	engine, err := pulse.New(pulse.Options{DataDir: root.Dir()})
	if err != nil {
		return fmt.Errorf("start pulse engine: %w", err)
	}

	// Git-backed history: init (or use the enclosing repository), the
	// managed .gitignore block. Never fatal: problems turn history off.
	hist := history.Open(context.Background(), root.Dir(), history.Options{Disabled: *noGit}, log.Printf)

	srv := server.New(root, engine, server.Config{
		PreviewTimeout:  *timeout,
		AutoPreviewRows: *autoRows,
		History:         hist,
		MaxUpload:       int64(maxUpload),
	}, web.FS(), web.Built())

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		return err
	}
	httpSrv := &http.Server{Handler: srv, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("serving %s at http://%s/", root.Dir(), ln.Addr())

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errc := make(chan error, 1)
	go func() { errc <- httpSrv.Serve(ln) }()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return httpSrv.Shutdown(shutdown)
	}
}

// sizeFlag is a byte count flag accepting a plain number or a number
// with a unit: KB/MB/GB/TB (powers of 1000), KiB/MiB/GiB/TiB (powers of
// 1024), B; case-insensitive, optional space ("2GiB", "500 MB").
type sizeFlag int64

func (f *sizeFlag) String() string { return strconv.FormatInt(int64(*f), 10) }

func (f *sizeFlag) Set(v string) error {
	n, err := parseSize(v)
	if err != nil {
		return err
	}
	*f = sizeFlag(n)
	return nil
}

func parseSize(v string) (int64, error) {
	s := strings.ToLower(strings.TrimSpace(v))
	units := []struct {
		suffix string
		mult   int64
	}{
		{"kib", 1 << 10}, {"mib", 1 << 20}, {"gib", 1 << 30}, {"tib", 1 << 40},
		{"kb", 1e3}, {"mb", 1e6}, {"gb", 1e9}, {"tb", 1e12},
		{"k", 1 << 10}, {"m", 1 << 20}, {"g", 1 << 30}, {"b", 1},
	}
	mult := int64(1)
	for _, u := range units {
		if strings.HasSuffix(s, u.suffix) {
			s, mult = strings.TrimSpace(strings.TrimSuffix(s, u.suffix)), u.mult
			break
		}
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f <= 0 || f*float64(mult) > float64(math.MaxInt64) {
		return 0, fmt.Errorf("invalid size %q", v)
	}
	return int64(f * float64(mult)), nil
}
