import { describe, expect, it } from "bun:test";
import { renderProgressFrame } from "../renderProgressFrame";

describe("renderProgressFrame", () => {
  it("renders determinate progress snapshots at several points", () => {
    const filename = "fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz";
    const frames = [
      renderProgressFrame({
        filename,
        bytesDownloaded: 0,
        totalBytes: 100_000_000,
        elapsedMs: 0,
      }),
      renderProgressFrame({
        filename,
        bytesDownloaded: 12_500_000,
        totalBytes: 100_000_000,
        elapsedMs: 3_000,
      }),
      renderProgressFrame({
        filename,
        bytesDownloaded: 50_000_000,
        totalBytes: 100_000_000,
        elapsedMs: 10_000,
      }),
      renderProgressFrame({
        filename,
        bytesDownloaded: 100_000_000,
        totalBytes: 100_000_000,
        elapsedMs: 20_000,
      }),
    ];

    expect(frames).toMatchInlineSnapshot(`
      [
        "⏵ fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz           0.000% (0B/100.00MB) 0B/s",
        "⏵ fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz        12.50% (12.50MB/100.00MB) 4.17MB/s | 21s left",
        "⏵ fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz        50.00% (50.00MB/100.00MB) 5.00MB/s | 10s left",
        "⏵ fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz        100.0% (100.00MB/100.00MB) 5.00MB/s",
      ]
    `);
  });

  it("renders indeterminate progress without ETA", () => {
    const filename = "fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz";
    const frame = renderProgressFrame({
      filename,
      bytesDownloaded: 12_000_000,
      totalBytes: null,
      elapsedMs: 2_000,
    });

    expect(frame).toMatchInlineSnapshot(`"⏵ fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz [ 12.00MB ] 6.00MB/s"`);
  });
});
