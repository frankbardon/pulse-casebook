// Package web embeds the built Studio UI.
//
// `make studio` builds studio/ui with Vite into web/dist before compiling Go.
// Only web/dist/.gitkeep is committed, so a fresh checkout still compiles,
// vets and tests; Built reports whether a real UI is present.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// FS returns the UI assets rooted at the build output directory.
func FS() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // the embed pattern guarantees dist exists
	}
	return sub
}

// Built reports whether the embedded UI contains an index.html.
func Built() bool {
	_, err := fs.Stat(FS(), "index.html")
	return err == nil
}
