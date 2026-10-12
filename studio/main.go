// Command studio serves Pulse Studio, a local visual request builder, for
// one directory of Pulse requests and cohorts.
//
//	studio <dir> [--port N] [--preview-timeout 10s] [--auto-preview-rows 1000000]
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/frankbardon/pulse"

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
	fset.Usage = func() {
		fmt.Fprintln(fset.Output(), "usage: studio <dir> [--port N] [--preview-timeout D] [--auto-preview-rows N]")
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

	srv := server.New(root, engine, server.Config{
		PreviewTimeout:  *timeout,
		AutoPreviewRows: *autoRows,
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
