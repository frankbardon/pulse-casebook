package main

import "testing"

func TestParseSize(t *testing.T) {
	tests := []struct {
		in   string
		want int64
		bad  bool
	}{
		{in: "2GiB", want: 2 << 30},
		{in: "500 MB", want: 500e6},
		{in: "1.5k", want: 1536},
		{in: "1024", want: 1024},
		{in: "10b", want: 10},
		{in: "0", bad: true},
		{in: "-1MiB", bad: true},
		{in: "lots", bad: true},
	}
	for _, tc := range tests {
		got, err := parseSize(tc.in)
		if tc.bad != (err != nil) || (!tc.bad && got != tc.want) {
			t.Errorf("parseSize(%q) = %d, %v", tc.in, got, err)
		}
	}
}
