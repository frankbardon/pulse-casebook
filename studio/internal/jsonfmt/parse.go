// Package jsonfmt parses JSON into an ordered tree and writes it back in
// the casebook's house style.
//
// Decoding is token level, never a map round-trip: object keys keep their
// source order, duplicate and unknown keys survive, and string and number
// literals keep their exact source spelling (escapes, exponents, trailing
// zeros). Only whitespace between tokens is decided by the formatter.
package jsonfmt

import (
	"fmt"
	"unicode/utf8"
)

// Kind is the JSON type of a Node.
type Kind int

// Node kinds.
const (
	Null Kind = iota
	Bool
	Number
	String
	Array
	Object
)

// Node is one JSON value. Scalars keep their raw source text in Raw
// (including quotes for strings). Objects keep Members in source order;
// arrays keep Items. Start and End are the byte span of the value in the
// parsed source (src[Start:End] is its exact text), so a caller can
// splice a change into the source without reformatting anything else;
// they are zero for nodes built in code.
type Node struct {
	Kind    Kind
	Raw     string
	Members []Member
	Items   []*Node

	Start, End int
}

// Member is one key/value pair of an object. Key is the raw quoted key
// exactly as written.
type Member struct {
	Key   string
	Value *Node
}

// SyntaxError reports malformed JSON with a byte offset.
type SyntaxError struct {
	Offset int
	Msg    string
}

func (e *SyntaxError) Error() string {
	return fmt.Sprintf("invalid JSON at offset %d: %s", e.Offset, e.Msg)
}

// maxDepth bounds nesting so hostile input cannot exhaust the stack.
const maxDepth = 512

// Parse decodes exactly one JSON value (surrounding whitespace allowed).
func Parse(src []byte) (*Node, error) {
	p := &parser{src: src}
	p.skipWS()
	n, err := p.value(0)
	if err != nil {
		return nil, err
	}
	p.skipWS()
	if p.pos != len(p.src) {
		return nil, p.errf("unexpected data after top-level value")
	}
	return n, nil
}

type parser struct {
	src []byte
	pos int
}

func (p *parser) errf(format string, args ...any) error {
	return &SyntaxError{Offset: p.pos, Msg: fmt.Sprintf(format, args...)}
}

func (p *parser) skipWS() {
	for p.pos < len(p.src) {
		switch p.src[p.pos] {
		case ' ', '\t', '\n', '\r':
			p.pos++
		default:
			return
		}
	}
}

func (p *parser) value(depth int) (*Node, error) {
	start := p.pos
	n, err := p.scan(depth)
	if err != nil {
		return nil, err
	}
	n.Start, n.End = start, p.pos
	return n, nil
}

func (p *parser) scan(depth int) (*Node, error) {
	if depth > maxDepth {
		return nil, p.errf("nesting exceeds %d levels", maxDepth)
	}
	if p.pos >= len(p.src) {
		return nil, p.errf("unexpected end of input")
	}
	switch c := p.src[p.pos]; {
	case c == '{':
		return p.object(depth)
	case c == '[':
		return p.array(depth)
	case c == '"':
		raw, err := p.str()
		if err != nil {
			return nil, err
		}
		return &Node{Kind: String, Raw: raw}, nil
	case c == '-' || (c >= '0' && c <= '9'):
		raw, err := p.number()
		if err != nil {
			return nil, err
		}
		return &Node{Kind: Number, Raw: raw}, nil
	case p.lit("true"):
		return &Node{Kind: Bool, Raw: "true"}, nil
	case p.lit("false"):
		return &Node{Kind: Bool, Raw: "false"}, nil
	case p.lit("null"):
		return &Node{Kind: Null, Raw: "null"}, nil
	default:
		return nil, p.errf("unexpected character %q", c)
	}
}

func (p *parser) lit(word string) bool {
	if len(p.src)-p.pos >= len(word) && string(p.src[p.pos:p.pos+len(word)]) == word {
		p.pos += len(word)
		return true
	}
	return false
}

func (p *parser) object(depth int) (*Node, error) {
	n := &Node{Kind: Object, Members: []Member{}}
	p.pos++ // {
	p.skipWS()
	if p.pos < len(p.src) && p.src[p.pos] == '}' {
		p.pos++
		return n, nil
	}
	for {
		p.skipWS()
		if p.pos >= len(p.src) || p.src[p.pos] != '"' {
			return nil, p.errf("expected object key")
		}
		key, err := p.str()
		if err != nil {
			return nil, err
		}
		p.skipWS()
		if p.pos >= len(p.src) || p.src[p.pos] != ':' {
			return nil, p.errf("expected ':' after object key")
		}
		p.pos++
		p.skipWS()
		v, err := p.value(depth + 1)
		if err != nil {
			return nil, err
		}
		n.Members = append(n.Members, Member{Key: key, Value: v})
		p.skipWS()
		if p.pos >= len(p.src) {
			return nil, p.errf("unterminated object")
		}
		switch p.src[p.pos] {
		case ',':
			p.pos++
		case '}':
			p.pos++
			return n, nil
		default:
			return nil, p.errf("expected ',' or '}' in object")
		}
	}
}

func (p *parser) array(depth int) (*Node, error) {
	n := &Node{Kind: Array, Items: []*Node{}}
	p.pos++ // [
	p.skipWS()
	if p.pos < len(p.src) && p.src[p.pos] == ']' {
		p.pos++
		return n, nil
	}
	for {
		p.skipWS()
		v, err := p.value(depth + 1)
		if err != nil {
			return nil, err
		}
		n.Items = append(n.Items, v)
		p.skipWS()
		if p.pos >= len(p.src) {
			return nil, p.errf("unterminated array")
		}
		switch p.src[p.pos] {
		case ',':
			p.pos++
		case ']':
			p.pos++
			return n, nil
		default:
			return nil, p.errf("expected ',' or ']' in array")
		}
	}
}

// str scans a string literal and returns it raw, quotes included.
func (p *parser) str() (string, error) {
	start := p.pos
	p.pos++ // opening quote
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		switch {
		case c == '"':
			p.pos++
			return string(p.src[start:p.pos]), nil
		case c == '\\':
			p.pos++
			if p.pos >= len(p.src) {
				return "", p.errf("unterminated string")
			}
			switch p.src[p.pos] {
			case '"', '\\', '/', 'b', 'f', 'n', 'r', 't':
				p.pos++
			case 'u':
				if len(p.src)-p.pos < 5 || !isHex4(p.src[p.pos+1:p.pos+5]) {
					return "", p.errf("invalid \\u escape")
				}
				p.pos += 5
			default:
				return "", p.errf("invalid escape character %q", p.src[p.pos])
			}
		case c < 0x20:
			return "", p.errf("control character in string")
		case c < utf8.RuneSelf:
			p.pos++
		default:
			r, size := utf8.DecodeRune(p.src[p.pos:])
			if r == utf8.RuneError && size == 1 {
				return "", p.errf("invalid UTF-8 in string")
			}
			p.pos += size
		}
	}
	return "", p.errf("unterminated string")
}

func isHex4(b []byte) bool {
	for _, c := range b {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F') {
			return false
		}
	}
	return true
}

// number scans a number literal per the JSON grammar and returns it raw.
func (p *parser) number() (string, error) {
	start := p.pos
	if p.src[p.pos] == '-' {
		p.pos++
	}
	if p.pos >= len(p.src) {
		return "", p.errf("invalid number")
	}
	if p.src[p.pos] == '0' {
		p.pos++
	} else if p.digits() == 0 {
		return "", p.errf("invalid number")
	}
	if p.pos < len(p.src) && p.src[p.pos] == '.' {
		p.pos++
		if p.digits() == 0 {
			return "", p.errf("invalid number: missing fraction digits")
		}
	}
	if p.pos < len(p.src) && (p.src[p.pos] == 'e' || p.src[p.pos] == 'E') {
		p.pos++
		if p.pos < len(p.src) && (p.src[p.pos] == '+' || p.src[p.pos] == '-') {
			p.pos++
		}
		if p.digits() == 0 {
			return "", p.errf("invalid number: missing exponent digits")
		}
	}
	return string(p.src[start:p.pos]), nil
}

func (p *parser) digits() int {
	n := 0
	for p.pos < len(p.src) && p.src[p.pos] >= '0' && p.src[p.pos] <= '9' {
		p.pos++
		n++
	}
	return n
}
