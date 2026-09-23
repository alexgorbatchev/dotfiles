package downloader

import (
	"errors"
	"net/http"
	"strings"
)

// maxRedirects is net/http's own limit, which a client with a CheckRedirect of its
// own no longer gets from the default policy.
const maxRedirects = 10

// HostScopedClient returns a copy of client that drops the Authorization header on
// any redirect leaving the host of the original request. net/http keeps the header
// on redirects to the same domain or a subdomain of it, which would hand a token
// configured for one host to another. An existing CheckRedirect policy still runs.
func HostScopedClient(client *http.Client) *http.Client {
	if client == nil {
		client = http.DefaultClient
	}
	scoped := *client
	previous := client.CheckRedirect
	scoped.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if !strings.EqualFold(req.URL.Host, via[0].URL.Host) || !strings.EqualFold(req.URL.Scheme, via[0].URL.Scheme) {
			req.Header.Del("Authorization")
		}
		if previous != nil {
			return previous(req, via)
		}
		if len(via) >= maxRedirects {
			return errors.New("stopped after 10 redirects")
		}
		return nil
	}
	return &scoped
}

// requestClient is the client a download with opts goes through.
func (d *Downloader) requestClient(opts ...DownloadOptions) *http.Client {
	if len(opts) > 0 && opts[0].HostScopedHeaders {
		return HostScopedClient(d.client)
	}
	return d.client
}
