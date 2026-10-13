// Package fileops holds the crash-safe file steps the journaled
// operations (internal/promote) are built from: each
// is idempotent, so a journal can replay it, and none overwrites.
package fileops

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Move renames from to to, creating to's parent directories. It is done
// already when from is gone and to exists. It never overwrites.
func Move(from, to string) error {
	_, ferr := os.Lstat(from)
	_, terr := os.Lstat(to)
	switch {
	case ferr == nil && errors.Is(terr, fs.ErrNotExist):
		if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
			return err
		}
		return os.Rename(from, to)
	case errors.Is(ferr, fs.ErrNotExist) && terr == nil:
		return nil
	case ferr == nil && terr == nil:
		return errors.New("the target already exists")
	case ferr != nil && !errors.Is(ferr, fs.ErrNotExist):
		return ferr
	case terr != nil && !errors.Is(terr, fs.ErrNotExist):
		return terr
	}
	return errors.New("neither the source nor the target exists")
}

// WriteAtomic writes data to path through a temp file in the same
// directory and a rename.
func WriteAtomic(path string, data []byte, mode fs.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	_, err = tmp.Write(data)
	if err == nil {
		err = tmp.Chmod(mode)
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(name, path)
	}
	if err != nil {
		_ = os.Remove(name)
	}
	return err
}
