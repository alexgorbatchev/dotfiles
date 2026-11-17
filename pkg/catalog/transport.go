package catalog

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/lifecycle"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

const (
	requestTimeout          = 30 * time.Second
	maxGETRetries           = 2
	maxCompressedIndexBytes = 5 << 20
)

type fetchResponse struct {
	Data         []byte
	Status       int
	ETag         string
	LastModified string
	RetryAfter   string
}

type catalogTransport struct {
	base     http.RoundTripper
	client   *Client
	limit    int64
	response *fetchResponse
}

func (t *catalogTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if err := t.client.checkURL(request.URL); err != nil {
		return nil, err
	}
	req := request.Clone(request.Context())
	for _, header := range []string{"Authorization", "Proxy-Authorization", "Cookie", "Range"} {
		req.Header.Del(header)
	}
	req.Header.Set("Accept-Encoding", "gzip")
	response, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	t.response.Status = response.StatusCode
	t.response.ETag = response.Header.Get("ETag")
	t.response.LastModified = response.Header.Get("Last-Modified")
	t.response.RetryAfter = response.Header.Get("Retry-After")
	body := response.Body
	if response.Header.Get("Content-Encoding") == "gzip" {
		encodedLimit := t.limit
		if t.limit == maxIndexBytes {
			encodedLimit = maxCompressedIndexBytes
		}
		reader, err := gzip.NewReader(&boundedBody{body: body, remaining: encodedLimit})
		if err != nil {
			closeErr := body.Close()
			return nil, errors.Join(failure("integrity-failed", "", fmt.Errorf("decode catalog gzip: %w", err)), closeErr)
		}
		body = &gzipBody{Reader: reader, original: body}
	} else if response.Header.Get("Content-Encoding") != "" && response.Header.Get("Content-Encoding") != "identity" {
		closeErr := body.Close()
		return nil, errors.Join(failure("integrity-failed", "", fmt.Errorf("unsupported catalog content encoding")), closeErr)
	}
	response.Body = &boundedBody{body: body, remaining: t.limit}
	return response, nil
}

type boundedBody struct {
	body      io.ReadCloser
	remaining int64
}

func (b *boundedBody) Read(data []byte) (int, error) {
	if len(data) == 0 {
		return 0, nil
	}
	if b.remaining == 0 {
		var probe [1]byte
		n, err := b.body.Read(probe[:])
		if n > 0 {
			return 0, failure("integrity-failed", "", fmt.Errorf("catalog response exceeds its byte limit"))
		}
		return 0, err
	}
	if int64(len(data)) > b.remaining {
		data = data[:b.remaining]
	}
	n, err := b.body.Read(data)
	b.remaining -= int64(n)
	return n, err
}

func (b *boundedBody) Close() error { return b.body.Close() }

type gzipBody struct {
	*gzip.Reader
	original io.ReadCloser
}

func (g *gzipBody) Close() error { return errors.Join(g.Reader.Close(), g.original.Close()) }

func (c *Client) fetch(ctx context.Context, relative string, limit int64, headers map[string]string) (fetchResponse, error) {
	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-ctx.Done():
		return fetchResponse{}, ctx.Err()
	}
	resolved := c.origin.ResolveReference(&url.URL{Path: relative})
	if err := c.checkURL(resolved); err != nil {
		return fetchResponse{}, err
	}
	if c.log != nil {
		c.log.Debug(logger.Message("Downloading catalog " + resolved.String()))
	}
	for attempt := 0; attempt <= maxGETRetries; attempt++ {
		response, err := c.download(ctx, resolved.String(), limit, headers)
		if err == nil {
			return response, nil
		}
		if ctx.Err() != nil {
			return response, ctx.Err()
		}
		var catalogErr *Error
		if errors.As(err, &catalogErr) {
			return response, err
		}
		if attempt == maxGETRetries || !retryGET(response.Status, err) {
			return response, failure("network-failed", "", err)
		}
		delay := time.Duration(attempt+1) * time.Second
		if seconds, parseErr := strconv.Atoi(response.RetryAfter); parseErr == nil && seconds >= 0 {
			delay = time.Duration(min(seconds, 30)) * time.Second
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return response, ctx.Err()
		case <-timer.C:
		}
	}
	return fetchResponse{}, failure("network-failed", "", fmt.Errorf("catalog retry attempts exhausted"))
}

func retryGET(status int, err error) bool {
	if status != 0 {
		return status == 429 || status == 502 || status == 503 || status == 504
	}
	var network *url.Error
	return errors.As(err, &network) || errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.EOF)
}

func (c *Client) download(ctx context.Context, address string, limit int64, headers map[string]string) (fetchResponse, error) {
	response := fetchResponse{}
	client := *c.httpClient
	client.Timeout = requestTimeout
	client.Jar = nil
	base := client.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	client.Transport = &catalogTransport{base: base, client: c, limit: limit, response: &response}
	previous := client.CheckRedirect
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if err := c.checkURL(req.URL); err != nil {
			return err
		}
		if len(via) >= 10 {
			return failure("invalid-input", "", fmt.Errorf("catalog redirect limit exceeded"))
		}
		if previous != nil {
			return previous(req, via)
		}
		return nil
	}
	filesystem := fs.NewMemFS()
	if err := filesystem.MkdirAll("/response", 0700); err != nil {
		return response, err
	}
	d := downloader.NewDownloader(filesystem, nil)
	d.SetHTTPClient(&client)
	d.CacheEnabled = false
	d.SetQuiet(true)
	// Catalog downloads are not installation events. Override any inherited
	// emitter so the shared downloader cannot invoke a tool's install hooks.
	ctx = lifecycle.WithEmitter(ctx, func(context.Context, lifecycle.Event, lifecycle.Details) error { return nil })
	err := d.Download(ctx, address, "/response/body", "", downloader.DownloadOptions{Headers: headers, SkipCache: true, Quiet: true, OnProgress: func(int64, int64) {}})
	if response.Status == http.StatusNotModified {
		return response, nil
	}
	if err != nil {
		return response, err
	}
	response.Data, err = filesystem.ReadFile("/response/body")
	return response, err
}
