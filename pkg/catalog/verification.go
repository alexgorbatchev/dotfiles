package catalog

import (
	"time"
)

const verificationLifetime = 30 * 24 * time.Hour

// VerificationStatus recomputes freshness at display time. Index checks are
// already bound to their enclosing definition revision by validated projection.
func VerificationStatus(definitions []IndexDefinition, now time.Time) string {
	total, fresh := 0, 0
	hasHistory := false
	for _, definition := range definitions {
		for _, summary := range definition.Summaries {
			total++
			for _, check := range definition.Verification {
				if check.Target != summary.Target {
					continue
				}
				if check.Outcome == "failed" {
					return "failed"
				}
				if check.LastSuccessfulCheck != nil {
					hasHistory = true
				}
				if check.Outcome != "passed" {
					continue
				}
				hasHistory = true
				checked, err := time.Parse(time.RFC3339Nano, check.CheckedAt)
				if err == nil && !checked.After(now) && now.Sub(checked) <= verificationLifetime {
					fresh++
				}
			}
		}
	}
	if total > 0 && fresh == total {
		return "verified"
	}
	if fresh > 0 {
		return "partial"
	}
	if hasHistory {
		return "stale"
	}
	return "unverified"
}
