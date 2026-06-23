package unwrap

import (
	"bytes"
	"fmt"
	"text/template"
)

// Evaluate parses the given template pattern and executes it against the provided context.
// Safe pattern evaluator using Go's text/template engine to resolve placeholders like {{ .Version }} and {{ .Arch }}.
func Evaluate(pattern string, context interface{}) (string, error) {
	tmpl, err := template.New("pattern").Option("missingkey=error").Parse(pattern)
	if err != nil {
		return "", fmt.Errorf("parsing template pattern %q: %w", pattern, err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, context); err != nil {
		return "", fmt.Errorf("evaluating template pattern %q: %w", pattern, err)
	}

	return buf.String(), nil
}
