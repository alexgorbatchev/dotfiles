package catalog

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"testing"
)

func benchmarkIndex(b testing.TB) []byte {
	b.Helper()
	index := Index{SchemaVersion: 1, Entries: make([]IndexEntry, 10000)}
	for i := range index.Entries {
		entry := queryEntry(fmt.Sprintf("tool-%05d", i), "Synthetic tool", "Synthetic file utility")
		entry.SourcePath = "tools/t/o/" + entry.ID
		entry.Detail = Blob(nil)
		entry.VerificationStatus = "unverified"
		entry.Definitions[0].Revision = Blob(nil).SHA256
		entry.Definitions[0].MinimumCLIVersion = "2.6.0"
		entry.Definitions[0].Verification = []IndexVerification{}
		index.Entries[i] = entry
	}
	data, err := json.Marshal(index)
	if err != nil {
		b.Fatal(err)
	}
	return data
}

func TestIndex10000WireBudget(t *testing.T) {
	data := benchmarkIndex(t)
	if len(data) > maxIndexBytes {
		t.Fatalf("10,000 index size %d exceeds %d", len(data), maxIndexBytes)
	}
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if encoded.Len() > maxCompressedIndexBytes {
		t.Fatalf("10,000 compressed index size %d exceeds %d", encoded.Len(), maxCompressedIndexBytes)
	}
	index, err := Decode[Index](data)
	if err != nil {
		t.Fatal(err)
	}
	if err := index.Validate(queryRegistry(), TombstoneRegistry{SchemaVersion: 1, Tools: []Tombstone{}}); err != nil {
		t.Fatal(err)
	}
	result, err := Query(index, queryRegistry(), QueryOptions{Query: new("synthetic"), Page: 1, Limit: 20})
	if err != nil || result.Total != 10000 || len(result.Items) != 20 {
		t.Fatalf("bounded large query failed: %+v %v", result, err)
	}
	t.Logf("index decoded=%d, gzip=%d bytes", len(data), encoded.Len())
}

func BenchmarkDecode10000(b *testing.B) {
	data := benchmarkIndex(b)
	b.SetBytes(int64(len(data)))
	b.ResetTimer()
	for b.Loop() {
		if _, err := Decode[Index](data); err != nil {
			b.Fatal(err)
		}
	}
}
