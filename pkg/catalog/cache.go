package catalog

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type cacheState struct {
	Origin       string    `json:"origin"`
	Pointer      Pointer   `json:"pointer"`
	ETag         string    `json:"etag"`
	LastModified string    `json:"lastModified"`
	RetrievedAt  time.Time `json:"retrievedAt"`
}

func (c *Client) readState() (cacheState, error) {
	var state cacheState
	data, err := c.cacheBytes(filepath.Join(c.cacheDir, "state.json"), maxPointerBytes)
	if err != nil {
		return state, fmt.Errorf("catalog pointer cache: %w", err)
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, fmt.Errorf("invalid pointer cache: %w", err)
	}
	if state.Origin != c.origin.String() || state.RetrievedAt.IsZero() {
		return state, fmt.Errorf("pointer cache origin or retrieval time is invalid")
	}
	return state, state.Pointer.Validate()
}

func (c *Client) writeState(state cacheState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encode catalog cache state: %w", err)
	}
	return c.cacheWrite(filepath.Join(c.cacheDir, "state.json"), data)
}

func (c *Client) cacheBytes(name string, limit int64) ([]byte, error) {
	info, err := c.fsys.Lstat(name)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, fmt.Errorf("cache entry %q is not a bounded regular file", name)
	}
	file, err := c.fsys.Open(name)
	if err != nil {
		return nil, err
	}
	data, readErr := io.ReadAll(io.LimitReader(file, limit+1))
	closeErr := file.Close()
	if err := errors.Join(readErr, closeErr); err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("cache entry %q exceeds its bound", name)
	}
	return data, nil
}

func (c *Client) cacheWrite(name string, data []byte) error {
	if err := c.fsys.MkdirAll(filepath.Dir(name), 0700); err != nil {
		return fmt.Errorf("create catalog cache: %w", err)
	}
	temporary := name + "." + rand.Text() + ".pending"
	if err := c.fsys.WriteFile(temporary, data, 0600); err != nil {
		return fmt.Errorf("write catalog cache: %w", err)
	}
	if err := c.fsys.Rename(temporary, name); err != nil {
		removeErr := c.fsys.Remove(temporary)
		return errors.Join(fmt.Errorf("replace catalog cache: %w", err), removeErr)
	}
	return nil
}

func (c *Client) object(ctx context.Context, ref BlobRef, label string, limit int64, options RequestOptions) ([]byte, error) {
	if err := ref.Validate(limit); err != nil {
		return nil, failure("integrity-failed", "", fmt.Errorf("%s: %w", label, err))
	}
	name := filepath.Join(c.cacheDir, "objects", ref.SHA256)
	data, cacheErr := c.cacheBytes(name, ref.Size)
	if cacheErr == nil {
		cacheErr = ref.Verify(data)
		if cacheErr == nil {
			return data, nil
		}
	}
	if options.Offline {
		return nil, failure("cache-missing", "", fmt.Errorf("missing or invalid cached %s (%s): %w", label, ref.SHA256, cacheErr))
	}
	if cacheErr != nil && !errors.Is(cacheErr, os.ErrNotExist) && c.log != nil {
		c.log.Warn(logger.Message("Discarding invalid cached " + label + ": " + cacheErr.Error()))
	}
	response, err := c.fetch(ctx, "v1/objects/"+ref.SHA256, limit, nil)
	if err != nil {
		return nil, err
	}
	if response.Status != 200 {
		return nil, failure("integrity-failed", "", fmt.Errorf("object %s returned a response without bytes", label))
	}
	if err := ref.Verify(response.Data); err != nil {
		return nil, failure("integrity-failed", "", fmt.Errorf("%s: %w", label, err))
	}
	if !options.DryRun {
		if err := c.cacheWrite(name, response.Data); err != nil {
			return nil, err
		}
	}
	return response.Data, nil
}
