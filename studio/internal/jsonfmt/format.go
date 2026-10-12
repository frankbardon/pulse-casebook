package jsonfmt

import "strings"

// Style selects a layout. Both styles indent by two spaces, put ": "
// after keys and end the file with a newline.
type Style int

const (
	// House is the hand-written casebook style: the root is expanded,
	// short objects and scalar arrays sit inline, and arrays of objects
	// list one item per line. See Format for the exact rules.
	House Style = iota
	// Expanded puts every non-empty container member on its own line
	// (the shape of JSON.stringify(v, null, 2) and json.MarshalIndent).
	Expanded
)

func (s Style) String() string {
	if s == Expanded {
		return "expanded"
	}
	return "house"
}

const indentUnit = "  "

// Format writes n in the given style. The output always ends in "\n".
//
// House rules, derived from the showcase corpus:
//   - The root container is always expanded.
//   - Inline form is {"k": v, "k2": v2} and [a, b]; empty containers are
//     {} and [].
//   - An array of scalars is always inline, however long.
//   - An array holding two or more containers lists one item per line.
//   - An array holding exactly one container goes inline when its whole
//     line (indent, key and trailing comma included) fits in LineWidth
//     columns.
//   - An object goes inline when its whole line fits in LineWidth columns,
//     or ItemWidth columns when it is an item on its own line inside an
//     expanded array.
//   - Otherwise the container is expanded, one member per line.
func Format(n *Node, style Style) []byte {
	var b strings.Builder
	f := formatter{b: &b, style: style}
	f.block(n, 0)
	b.WriteByte('\n')
	return []byte(b.String())
}

// LineWidth is the house-style limit for inlining a container that sits
// after a key, and for inlining a one-container array.
const LineWidth = 120

// ItemWidth is the house-style limit for inlining a container that is an
// item on its own line inside an expanded array.
const ItemWidth = 160

type formatter struct {
	b     *strings.Builder
	style Style
}

// block writes n as a block that starts at the current column (already
// indented by depth) and may span several lines. It never writes a
// trailing comma.
func (f *formatter) block(n *Node, depth int) {
	switch n.Kind {
	case Object:
		if len(n.Members) == 0 {
			f.b.WriteString("{}")
			return
		}
		f.b.WriteString("{\n")
		for i, m := range n.Members {
			f.indent(depth + 1)
			f.b.WriteString(m.Key)
			f.b.WriteString(": ")
			f.member(m.Value, depth+1, runeLen(m.Key)+2, i < len(n.Members)-1, LineWidth)
		}
		f.indent(depth)
		f.b.WriteByte('}')
	case Array:
		if len(n.Items) == 0 {
			f.b.WriteString("[]")
			return
		}
		f.b.WriteString("[\n")
		for i, it := range n.Items {
			f.indent(depth + 1)
			f.member(it, depth+1, 0, i < len(n.Items)-1, ItemWidth)
		}
		f.indent(depth)
		f.b.WriteByte(']')
	default:
		f.b.WriteString(n.Raw)
	}
}

// member writes one object value or array item whose line already holds
// depth indentation plus prefix columns (the key), then a comma if more
// follow, then a newline.
func (f *formatter) member(n *Node, depth, prefix int, comma bool, width int) {
	if f.style == House && f.fitsInline(n, depth, prefix, comma, width) {
		writeInline(f.b, n)
	} else {
		f.block(n, depth)
	}
	if comma {
		f.b.WriteByte(',')
	}
	f.b.WriteByte('\n')
}

func (f *formatter) fitsInline(n *Node, depth, prefix int, comma bool, width int) bool {
	if n.Kind != Object && n.Kind != Array {
		return true
	}
	if n.Kind == Array && allScalar(n.Items) {
		return true
	}
	if n.Kind == Array && len(n.Items) > 1 {
		return false
	}
	w := width
	if n.Kind == Array {
		w = LineWidth
	}
	cols := depth*len(indentUnit) + prefix + inlineLen(n)
	if comma {
		cols++
	}
	return cols <= w
}

func allScalar(items []*Node) bool {
	for _, it := range items {
		if it.Kind == Object || it.Kind == Array {
			return false
		}
	}
	return true
}

func (f *formatter) indent(depth int) {
	for range depth {
		f.b.WriteString(indentUnit)
	}
}

// writeInline writes n on a single line.
func writeInline(b *strings.Builder, n *Node) {
	switch n.Kind {
	case Object:
		b.WriteByte('{')
		for i, m := range n.Members {
			if i > 0 {
				b.WriteString(", ")
			}
			b.WriteString(m.Key)
			b.WriteString(": ")
			writeInline(b, m.Value)
		}
		b.WriteByte('}')
	case Array:
		b.WriteByte('[')
		for i, it := range n.Items {
			if i > 0 {
				b.WriteString(", ")
			}
			writeInline(b, it)
		}
		b.WriteByte(']')
	default:
		b.WriteString(n.Raw)
	}
}

// inlineLen is the column count of writeInline(n). Raw literals are
// counted in runes so non-ASCII text does not count as wider than it is.
func inlineLen(n *Node) int {
	switch n.Kind {
	case Object:
		l := 2
		for i, m := range n.Members {
			if i > 0 {
				l += 2
			}
			l += runeLen(m.Key) + 2 + inlineLen(m.Value)
		}
		return l
	case Array:
		l := 2
		for i, it := range n.Items {
			if i > 0 {
				l += 2
			}
			l += inlineLen(it)
		}
		return l
	default:
		return runeLen(n.Raw)
	}
}

func runeLen(s string) int { return len([]rune(s)) }

// Detect reports the style an existing document is written in: Expanded
// when it is exactly the Expanded rendering of itself, otherwise House.
func Detect(src []byte) Style {
	n, err := Parse(src)
	if err != nil {
		return House
	}
	if string(Format(n, Expanded)) == string(src) {
		return Expanded
	}
	return House
}

// Reformat parses src and writes it in style.
func Reformat(src []byte, style Style) ([]byte, error) {
	n, err := Parse(src)
	if err != nil {
		return nil, err
	}
	return Format(n, style), nil
}
