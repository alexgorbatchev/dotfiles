package registry

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Permission represents a filesystem permission string, serialized to JSON as a base-10 decimal number.
type Permission string

func (p Permission) MarshalJSON() ([]byte, error) {
	s := string(p)
	if s == "" {
		return []byte("0"), nil
	}
	sClean := s
	if strings.HasPrefix(sClean, "0o") || strings.HasPrefix(sClean, "0O") {
		sClean = sClean[2:]
	}
	val, err := strconv.ParseUint(sClean, 8, 32)
	if err != nil {
		// Try parsing as decimal if it fails
		valDec, errDec := strconv.ParseUint(sClean, 10, 32)
		if errDec == nil {
			return []byte(strconv.FormatUint(valDec, 10)), nil
		}
		return nil, fmt.Errorf("invalid octal permission %q: %w", s, err)
	}
	return []byte(strconv.FormatUint(val, 10)), nil
}

func (p *Permission) UnmarshalJSON(b []byte) error {
	s := string(b)
	if s == "null" || s == "" {
		*p = ""
		return nil
	}
	// Trim quotes just in case the input is represented as a quoted string
	sClean := strings.Trim(s, `"`)
	val, err := strconv.ParseUint(sClean, 10, 32)
	if err != nil {
		return fmt.Errorf("invalid json number for permission %q: %w", s, err)
	}
	*p = Permission(fmt.Sprintf("0%o", val))
	return nil
}

func (p *Permission) Scan(value interface{}) error {
	if value == nil {
		*p = ""
		return nil
	}
	var s string
	switch v := value.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("unsupported type for Permission Scan: %T", value)
	}
	*p = Permission(DecimalToOctalPerm(s))
	return nil
}

func (p Permission) Value() (driver.Value, error) {
	if p == "" {
		return nil, nil
	}
	return OctalToDecimalPerm(string(p)), nil
}

// Registry manages database-backed operation and state logging.
type Registry struct {
	db *sql.DB
}

// NewRegistry instantiates a new Registry manager with an active database connection.
func NewRegistry(db *sql.DB) *Registry {
	return &Registry{db: db}
}

// Begin starts a database transaction.
func (r *Registry) Begin(ctx context.Context) (*sql.Tx, error) {
	return r.db.BeginTx(ctx, nil)
}

// WithTx runs a function within a transactional block.
func (r *Registry) WithTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := r.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit()
}

// OctalToDecimalPerm converts an octal permission string (e.g., "0755", "755", "0644")
// to a decimal string (e.g., "493", "420").
func OctalToDecimalPerm(s string) string {
	if s == "" {
		return ""
	}
	sClean := strings.TrimSpace(s)
	if strings.HasPrefix(sClean, "0o") || strings.HasPrefix(sClean, "0O") {
		sClean = sClean[2:]
		val, err := strconv.ParseUint(sClean, 8, 32)
		if err == nil {
			return strconv.FormatUint(val, 10)
		}
		return s
	}
	if strings.HasPrefix(sClean, "0") && len(sClean) > 1 {
		val, err := strconv.ParseUint(sClean[1:], 8, 32)
		if err == nil {
			return strconv.FormatUint(val, 10)
		}
		return s
	}
	valDec, errDec := strconv.ParseUint(sClean, 10, 32)
	if errDec != nil {
		valOct, errOct := strconv.ParseUint(sClean, 8, 32)
		if errOct == nil {
			return strconv.FormatUint(valOct, 10)
		}
		return s
	}
	if valDec > 511 {
		valOct, errOct := strconv.ParseUint(sClean, 8, 32)
		if errOct == nil {
			return strconv.FormatUint(valOct, 10)
		}
		return sClean
	}
	return sClean
}

// DecimalToOctalPerm converts a decimal permission string (e.g., "493", "420")
// to an octal string with leading zero (e.g., "0755", "0644").
func DecimalToOctalPerm(s string) string {
	if s == "" {
		return ""
	}
	sClean := strings.TrimSpace(s)
	if strings.HasPrefix(sClean, "0o") || strings.HasPrefix(sClean, "0O") {
		return "0" + sClean[2:]
	}
	if strings.HasPrefix(sClean, "0") && len(sClean) > 1 {
		return sClean
	}
	val, err := strconv.ParseUint(sClean, 10, 32)
	if err != nil {
		_, errOct := strconv.ParseUint(sClean, 8, 32)
		if errOct == nil {
			return "0" + sClean
		}
		return s
	}
	if val > 511 {
		return "0" + sClean
	}
	return fmt.Sprintf("0%o", val)
}

// FileModeToDecimalString converts an os.FileMode to its decimal base-10 string representation.
func FileModeToDecimalString(mode os.FileMode) string {
	perm := uint32(mode & os.ModePerm)
	return strconv.FormatUint(uint64(perm), 10)
}

// DecimalStringToMode converts a decimal base-10 string representation back to os.FileMode.
func DecimalStringToMode(s string) (os.FileMode, error) {
	val, err := strconv.ParseUint(s, 10, 32)
	if err != nil {
		return 0, err
	}
	return os.FileMode(val), nil
}
