// Package preview computes per-node preview probes by request truncation:
// for a graph node it builds a sub-request holding the nodes upstream of it
// plus a terminal probe, runs it in-process with one engine call, and
// reduces the engine response to a typed probe result.
package preview

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Segment is one step of a node path: an object key (Key) or an array
// index (Index, when IsIndex).
type Segment struct {
	Key     string
	Index   int
	IsIndex bool
}

// Key returns an object-key segment.
func Key(k string) Segment { return Segment{Key: k} }

// Index returns an array-index segment.
func Index(i int) Segment { return Segment{Index: i, IsIndex: true} }

func (s Segment) String() string {
	if s.IsIndex {
		return strconv.Itoa(s.Index)
	}
	return s.Key
}

// Node ids are JSON paths into the request document. This is the Go twin
// of studio/ui/src/graph/nodePath.ts and must accept exactly the same
// grammar:
//
//	path    := ""                       the document root
//	         | first rest*
//	first   := ident | index | quoted
//	rest    := "." ident | index | quoted
//	ident   := [A-Za-z_][A-Za-z0-9_]*
//	index   := "[" digits "]"           base 10, no sign, no leading zeros
//	quoted  := "[" json-string "]"      any non-identifier object key
//
// FormatPath and ParsePath are exact inverses.

var (
	identRe     = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	identPrefix = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*`)
	indexPrefix = regexp.MustCompile(`^\[(0|[1-9][0-9]*)\]`)
)

// FormatPath renders segments as a node id.
func FormatPath(segs []Segment) string {
	var b strings.Builder
	for _, s := range segs {
		switch {
		case s.IsIndex:
			if s.Index < 0 {
				panic(fmt.Sprintf("invalid path index: %d", s.Index))
			}
			b.WriteString("[" + strconv.Itoa(s.Index) + "]")
		case identRe.MatchString(s.Key):
			if b.Len() > 0 {
				b.WriteByte('.')
			}
			b.WriteString(s.Key)
		default:
			b.WriteString("[" + jsString(s.Key) + "]")
		}
	}
	return b.String()
}

// jsString encodes s the way JavaScript's JSON.stringify does: quote,
// backslash and control characters escaped, everything else literal
// (Go's encoder would also escape HTML characters and U+2028/U+2029).
func jsString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

// ParsePath splits a node id into segments.
func ParsePath(id string) ([]Segment, error) {
	var segs []Segment
	i := 0
	fail := func(why string) ([]Segment, error) {
		return nil, fmt.Errorf("invalid node path %q at %d: %s", id, i, why)
	}
	for i < len(id) {
		switch c := id[i]; {
		case c == '[':
			if i+1 < len(id) && id[i+1] == '"' {
				// Quoted key: scan to the closing quote, honouring escapes.
				j := i + 2
				for j < len(id) && id[j] != '"' {
					if id[j] == '\\' {
						j += 2
					} else {
						j++
					}
				}
				if j >= len(id) || j+1 >= len(id) || id[j+1] != ']' {
					return fail("unterminated quoted key")
				}
				var key string
				if err := json.Unmarshal([]byte(id[i+1:j+1]), &key); err != nil {
					return fail("bad quoted key")
				}
				if identRe.MatchString(key) {
					return fail("quoted key must be a non-identifier string")
				}
				segs = append(segs, Key(key))
				i = j + 2
			} else {
				m := indexPrefix.FindStringSubmatch(id[i:])
				if m == nil {
					return fail("expected index")
				}
				n, err := strconv.Atoi(m[1])
				if err != nil {
					return fail("expected index")
				}
				segs = append(segs, Index(n))
				i += len(m[0])
			}
		case c == '.':
			if len(segs) == 0 {
				return fail("leading dot")
			}
			i++
			m := identPrefix.FindString(id[i:])
			if m == "" {
				return fail("expected identifier")
			}
			segs = append(segs, Key(m))
			i += len(m)
		default:
			if len(segs) != 0 {
				return fail(`expected "." or "["`)
			}
			m := identPrefix.FindString(id[i:])
			if m == "" {
				return fail("expected identifier")
			}
			segs = append(segs, Key(m))
			i += len(m)
		}
	}
	return segs, nil
}
