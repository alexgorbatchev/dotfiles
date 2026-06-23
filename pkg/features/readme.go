package features

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// Metadata represents extracted tool metadata from a markdown readme.
type Metadata struct {
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Description string            `json:"description"`
	Attributes  map[string]string `json:"attributes"`
}

// ParseReadme parses markdown with optional YAML frontmatter to extract metadata.
// Returns (Metadata, remainingMarkdown).
func ParseReadme(markdown string) (*Metadata, string) {
	lines := strings.Split(markdown, "\n")
	metadata := &Metadata{
		Attributes: make(map[string]string),
	}

	contentStartIndex := 0

	// Parse YAML Frontmatter
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		for i := 1; i < len(lines); i++ {
			line := strings.TrimSpace(lines[i])
			if line == "---" {
				contentStartIndex = i + 1
				break
			}
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"'`)
				metadata.Attributes[key] = val
				switch key {
				case "name":
					metadata.Name = val
				case "version":
					metadata.Version = val
				case "description":
					metadata.Description = val
				}
			}
		}
	}

	remainingMarkdown := strings.Join(lines[contentStartIndex:], "\n")
	remLines := strings.Split(remainingMarkdown, "\n")

	for i, line := range remLines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "# ") && metadata.Name == "" {
			metadata.Name = strings.TrimPrefix(trimmed, "# ")
			for j := i + 1; j < len(remLines); j++ {
				descLine := strings.TrimSpace(remLines[j])
				if descLine != "" && !strings.HasPrefix(descLine, "#") {
					if metadata.Description == "" {
						metadata.Description = descLine
					}
					break
				}
			}
			break
		}
	}

	return metadata, remainingMarkdown
}

// CacheItem represents a stored readme item in cache.
type CacheItem struct {
	ToolName  string    `json:"tool_name"`
	Readme    string    `json:"readme"`
	Metadata  *Metadata `json:"metadata"`
	Timestamp int64     `json:"timestamp"`
}

// ReadmeCache manages caching of tool readmes.
type ReadmeCache struct {
	fs  fs.FS
	dir string
}

// NewReadmeCache creates a new ReadmeCache instance.
func NewReadmeCache(f fs.FS, dir string) *ReadmeCache {
	return &ReadmeCache{fs: f, dir: dir}
}

// Put writes a CacheItem into the cache.
func (c *ReadmeCache) Put(toolName string, item *CacheItem) error {
	if toolName == "" {
		return fmt.Errorf("tool name must not be empty")
	}

	if err := c.fs.MkdirAll(c.dir, 0755); err != nil {
		return fmt.Errorf("creating cache directory: %w", err)
	}

	data, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("marshaling cache item: %w", err)
	}

	cachePath := filepath.Join(c.dir, toolName+".json")
	if err := c.fs.WriteFile(cachePath, data, 0644); err != nil {
		return fmt.Errorf("writing cache file: %w", err)
	}

	return nil
}

// Get retrieves a CacheItem from the cache if it exists and has not expired.
// Returns (CacheItem, error). If item is expired or does not exist, returns (nil, nil).
func (c *ReadmeCache) Get(toolName string, ttl time.Duration) (*CacheItem, error) {
	if toolName == "" {
		return nil, fmt.Errorf("tool name must not be empty")
	}

	cachePath := filepath.Join(c.dir, toolName+".json")
	exists, err := c.fs.Exists(cachePath)
	if err != nil {
		return nil, fmt.Errorf("checking cache existence: %w", err)
	}
	if !exists {
		return nil, nil
	}

	data, err := c.fs.ReadFile(cachePath)
	if err != nil {
		return nil, fmt.Errorf("reading cache file: %w", err)
	}

	var item CacheItem
	if err := json.Unmarshal(data, &item); err != nil {
		_ = c.fs.Remove(cachePath)
		return nil, nil
	}

	if time.Now().Unix()-item.Timestamp > int64(ttl.Seconds()) {
		_ = c.fs.Remove(cachePath)
		return nil, nil
	}

	return &item, nil
}
