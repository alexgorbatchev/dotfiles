package main

import (
	"io"
	"strconv"
	"strings"
)

// writeCatalogText preserves source layout while displaying terminal controls
// as character escapes. JSON envelopes retain the exact original source bytes.
func writeCatalogText(out io.Writer, text string) error {
	var escaped strings.Builder
	for _, r := range text {
		if r == '\n' || r == '\t' || strconv.IsPrint(r) {
			escaped.WriteRune(r)
			continue
		}
		quoted := strconv.QuoteRune(r)
		escaped.WriteString(quoted[1 : len(quoted)-1])
	}
	_, err := io.WriteString(out, escaped.String())
	return err
}
