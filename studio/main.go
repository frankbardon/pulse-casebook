// Command studio serves Pulse Studio, a local visual request builder, for
// one library directory (internal/library): global cohorts and schemas
// plus workspaces of analyses. A missing or empty directory becomes a new
// library; a non-empty directory without library.json is refused.
//
//	studio <dir> [--port N] [--preview-timeout 10s] [--auto-preview-rows 1000000] [--no-git] [--max-upload 2GiB]
//
// The global area and every workspace are kept in git repositories of
// their own (see internal/history): every studio write is committed,
// unless --no-git is given or git is not installed.
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

	"github.com/frankbardon/pulse-casebook/studio/internal/library"
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

	// A new directory becomes a library.
	info, err := os.Stat(positional[0])
	if errors.Is(err, os.ErrNotExist) {
		if err := os.MkdirAll(positional[0], 0o755); err != nil {
			return err
		}
		info, err = os.Stat(positional[0])
	}
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", positional[0])
	}
	// The library (an empty directory gets library.json; any other
	// directory without it is refused). Git-backed history per area is
	// never fatal: problems turn it off.
	lib, err := library.Open(positional[0])
	if errors.Is(err, library.ErrNotLibrary) {
		return fmt.Errorf("%s is not a Pulse Studio library (it has files but no %s): create one with `bin/studio <new or empty dir>`", positional[0], library.MarkerFile)
	}
	if err != nil {
		return err
	}
	srv, err := server.NewLibrary(context.Background(), lib, server.LibraryOptions{
		Config: server.Config{
			PreviewTimeout:  *timeout,
			AutoPreviewRows: *autoRows,
			MaxUpload:       int64(maxUpload),
		},
		NoGit: *noGit,
		Logf:  log.Printf,
	}, web.FS(), web.Built())
	if err != nil {
		return err
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		return err
	}
	httpSrv := &http.Server{Handler: srv, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("serving %s at http://%s/", lib.Dir(), ln.Addr())

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
