package catalog

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Decode checks exact wire property names, required/null fields and integer
// representation before decoding. encoding/json's case folding and duplicate
// replacement cannot decide a content-addressed protocol's meaning.
func Decode[T any](data []byte) (T, error) {
	var value T
	raw, err := parseJSON(data)
	if err != nil {
		return value, err
	}
	if err := validateShape(raw, reflect.TypeFor[T](), "$", 0); err != nil {
		return value, err
	}
	if err := json.Unmarshal(data, &value); err != nil {
		return value, fmt.Errorf("decode catalog JSON: %w", err)
	}
	return value, nil
}

const maxJSONDepth = 64

func parseJSON(data []byte) (any, error) {
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("catalog JSON must be valid UTF-8")
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	v, err := readJSON(d, 0)
	if err != nil {
		return nil, fmt.Errorf("parse catalog JSON: %w", err)
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, fmt.Errorf("catalog JSON must contain exactly one value")
	}
	return v, nil
}

func readJSON(d *json.Decoder, depth int) (any, error) {
	if depth > maxJSONDepth {
		return nil, fmt.Errorf("JSON nesting exceeds %d", maxJSONDepth)
	}
	token, err := d.Token()
	if err != nil {
		return nil, err
	}
	delim, compound := token.(json.Delim)
	if !compound {
		if n, ok := token.(json.Number); ok {
			if _, err := n.Int64(); err != nil {
				return nil, fmt.Errorf("number %q is not an integer: %w", n, err)
			}
		}
		return token, nil
	}
	if delim == '{' {
		object := make(map[string]any)
		for d.More() {
			keyToken, err := d.Token()
			if err != nil {
				return nil, err
			}
			key, ok := keyToken.(string)
			if !ok {
				return nil, fmt.Errorf("object key must be a string")
			}
			if _, exists := object[key]; exists {
				return nil, fmt.Errorf("duplicate property %q", key)
			}
			for _, c := range key {
				if c > 127 {
					return nil, fmt.Errorf("object key %q is not ASCII", key)
				}
			}
			value, err := readJSON(d, depth+1)
			if err != nil {
				return nil, err
			}
			object[key] = value
		}
		_, err := d.Token()
		return object, err
	}
	if delim == '[' {
		array := make([]any, 0)
		for d.More() {
			value, err := readJSON(d, depth+1)
			if err != nil {
				return nil, err
			}
			array = append(array, value)
		}
		_, err := d.Token()
		return array, err
	}
	return nil, fmt.Errorf("unexpected JSON delimiter %q", delim)
}

func validateShape(value any, typ reflect.Type, path string, depth int) error {
	if depth > maxJSONDepth {
		return fmt.Errorf("%s exceeds nesting limit", path)
	}
	if typ.Kind() == reflect.Pointer {
		if value == nil {
			return nil
		}
		return validateShape(value, typ.Elem(), path, depth+1)
	}
	if value == nil {
		return fmt.Errorf("%s must not be null", path)
	}
	switch typ.Kind() {
	case reflect.Struct:
		object, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("%s must be an object", path)
		}
		fields := make(map[string]reflect.Type, typ.NumField())
		if err := wireShapeFields(typ, fields, depth); err != nil {
			return err
		}
		for key, val := range object {
			field, ok := fields[key]
			if !ok {
				return fmt.Errorf("unknown property %s.%s", path, key)
			}
			if err := validateShape(val, field, path+"."+key, depth+1); err != nil {
				return err
			}
		}
		for key := range fields {
			if _, ok := object[key]; !ok {
				return fmt.Errorf("missing property %s.%s", path, key)
			}
		}
	case reflect.Slice:
		array, ok := value.([]any)
		if !ok {
			return fmt.Errorf("%s must be an array", path)
		}
		for i, val := range array {
			if err := validateShape(val, typ.Elem(), path+"["+strconv.Itoa(i)+"]", depth+1); err != nil {
				return err
			}
		}
	case reflect.String:
		if _, ok := value.(string); !ok {
			return fmt.Errorf("%s must be a string", path)
		}
	case reflect.Bool:
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("%s must be a boolean", path)
		}
	case reflect.Int, reflect.Int64:
		if _, ok := value.(json.Number); !ok {
			return fmt.Errorf("%s must be an integer", path)
		}
	default:
		return fmt.Errorf("unsupported wire type %s at %s", typ, path)
	}
	return nil
}

// Catalog fields have explicit JSON identities. Untagged embedded value
// structs (such as ResultContext) contribute their required fields to the
// enclosing object, matching their native encoding/json representation.
func wireShapeFields(typ reflect.Type, fields map[string]reflect.Type, depth int) error {
	if depth > maxJSONDepth {
		return errors.New("catalog wire type exceeds nesting limit")
	}
	for index := range typ.NumField() {
		field := typ.Field(index)
		key := strings.Split(field.Tag.Get("json"), ",")[0]
		if !field.IsExported() || key == "-" {
			continue
		}
		if key == "" && field.Anonymous && field.Type.Kind() == reflect.Struct {
			if err := wireShapeFields(field.Type, fields, depth+1); err != nil {
				return err
			}
			continue
		}
		if key == "" {
			return fmt.Errorf("catalog wire field %s has no explicit JSON identity", field.Name)
		}
		if _, found := fields[key]; found {
			return fmt.Errorf("ambiguous catalog wire property %s", key)
		}
		fields[key] = field.Type
	}
	return nil
}

// CanonicalJSON preserves array order and emits recursively sorted ASCII keys.
func CanonicalJSON(value any) ([]byte, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal catalog JSON: %w", err)
	}
	raw, err := parseJSON(data)
	if err != nil {
		return nil, err
	}
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(raw); err != nil {
		return nil, fmt.Errorf("encode canonical JSON: %w", err)
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte{'\n'}), nil
}

// Blob describes the exact bytes; asset newlines and encodings are untouched.
func Blob(data []byte) BlobRef {
	hash := sha256.Sum256(data)
	return BlobRef{SHA256: hex.EncodeToString(hash[:]), Size: int64(len(data))}
}

func (b BlobRef) Verify(data []byte) error {
	if actual := Blob(data); actual != b {
		return fmt.Errorf("blob integrity mismatch: expected %s (%d bytes), received %s (%d bytes)", b.SHA256, b.Size, actual.SHA256, actual.Size)
	}
	return nil
}

func IsText(data []byte) bool { return utf8.Valid(data) && !bytes.ContainsRune(data, 0) }

func (m DefinitionManifest) Revision() (string, error) {
	if err := m.Validate(); err != nil {
		return "", err
	}
	data, err := CanonicalJSON(m)
	if err != nil {
		return "", err
	}
	return Blob(data).SHA256, nil
}
