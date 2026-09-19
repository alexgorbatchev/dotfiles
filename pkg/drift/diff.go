package drift

import (
	"fmt"
	"strings"

	"github.com/epiclabs-io/diff3"
)

// UnifiedDiff produces a unified diff string between oldText and newText.
// If both texts are identical, it returns an empty string.
func UnifiedDiff(oldLabel, newLabel, oldText, newText string) string {
	if oldText == newText {
		return ""
	}

	oldLines, err := splitLines(oldText)
	if err != nil {
		return fmt.Sprintf("Binary files %s and %s differ\n", oldLabel, newLabel)
	}
	newLines, err := splitLines(newText)
	if err != nil {
		return fmt.Sprintf("Binary files %s and %s differ\n", oldLabel, newLabel)
	}

	// Use diff3's 2-way diff (DiffComm)
	diffResults := diff3.DiffComm(oldLines, newLines)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- %s\n", oldLabel))
	sb.WriteString(fmt.Sprintf("+++ %s\n", newLabel))

	hasChanges := false
	for _, res := range diffResults {
		if res.Common != nil {
			for _, line := range res.Common {
				if line == "" {
					sb.WriteString("\n")
				} else {
					sb.WriteString(" " + line + "\n")
				}
			}
		} else {
			hasChanges = true
			for _, line := range res.File1 {
				sb.WriteString("-" + line + "\n")
			}
			for _, line := range res.File2 {
				sb.WriteString("+" + line + "\n")
			}
		}
	}

	if !hasChanges {
		return ""
	}

	return strings.TrimSuffix(sb.String(), "\n") + "\n"
}
