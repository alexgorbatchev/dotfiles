import { describe, expect, it } from "bun:test";
import assert from "node:assert";
import { ProgressBar } from "../ProgressBar";

interface ITestStream {
  isTTY: true;
  output: string;
  write(chunk: string): boolean;
}

function createTestStream(): ITestStream {
  return {
    isTTY: true,
    output: "",
    write(chunk: string): boolean {
      this.output += chunk;
      return true;
    },
  };
}

function normalizeTerminalOutput(output: string): string {
  return output
    .replaceAll("\u001b\\", "<ST>")
    .replaceAll("\u0007", "<BEL>")
    .replaceAll("\r", "<CR>")
    .replaceAll("\n", "<LF>")
    .replaceAll("\u001b", "<ESC>");
}

describe("ProgressBar", () => {
  it("emits osc determinate progress on supported terminals", async () => {
    const originalNow = Date.now;
    const filename = "fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz";
    const stream = createTestStream();
    let now = 1_000;

    try {
      Date.now = (): number => now;

      const progressBar = new ProgressBar(filename, {
        enabled: true,
        env: { ...process.env, WT_SESSION: "1" },
        stream,
      });
      const onProgress = progressBar.createCallback();

      assert(onProgress);
      onProgress(0, 100_000_000);

      now = 11_000;
      onProgress(50_000_000, 100_000_000);
      progressBar.finish();
    } finally {
      Date.now = originalNow;
    }

    await Bun.sleep(200);

    expect(normalizeTerminalOutput(stream.output)).toMatchInlineSnapshot(
      `"<ESC>[?25l<ESC>]9;4;1;0;fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz<ST><CR><ESC>[2K<ESC>[34m⏵<ESC>[0m <ESC>[1mfd-v10.2.0-x86_64-unknown-linux-musl.tar.gz<ESC>[0m <ESC>[100m          <ESC>[0m<ESC>[33;100m0.000%<ESC>[0m<ESC>[100m <ESC>[0m<ESC>[37;100m(0B/100.00MB)<ESC>[0m<ESC>[100m          <ESC>[0m 0B/s<ESC>]9;4;1;50;fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz<ST><CR><ESC>[2K<ESC>[34m⏵<ESC>[0m <ESC>[1mfd-v10.2.0-x86_64-unknown-linux-musl.tar.gz<ESC>[0m <ESC>[30;107m       50.00% <ESC>[0m<ESC>[90;107m(50.00<ESC>[0m<ESC>[37;100mMB/100.00MB)<ESC>[0m<ESC>[100m        <ESC>[0m 5.00MB/s<ESC>[2m | 10s left<ESC>[0m<ESC>]9;4;1;100;fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz<ST><LF><ESC>[?25h<ESC>]9;4;0;0;fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz<ST>"`,
    );
  });

  it("emits osc indeterminate progress and error state on supported terminals", async () => {
    const originalNow = Date.now;
    const filename = "gh-v2.74.2-linux-amd64.tar.gz";
    const stream = createTestStream();
    const now = 1_000;

    try {
      Date.now = (): number => now;

      const progressBar = new ProgressBar(filename, {
        enabled: true,
        env: { ...process.env, WT_SESSION: "1" },
        stream,
      });
      const onProgress = progressBar.createCallback();

      assert(onProgress);
      onProgress(12_000_000, null);
      progressBar.fail();
    } finally {
      Date.now = originalNow;
    }

    await Bun.sleep(200);

    expect(normalizeTerminalOutput(stream.output)).toMatchInlineSnapshot(
      `"<ESC>[?25l<ESC>]9;4;3;;gh-v2.74.2-linux-amd64.tar.gz<ST><CR><ESC>[2K<ESC>[34m⏵<ESC>[0m <ESC>[1mgh-v2.74.2-linux-amd64.tar.gz<ESC>[0m <ESC>[30;107m[ 12.00MB ]<ESC>[0m 0B/s<ESC>]9;4;2;;gh-v2.74.2-linux-amd64.tar.gz<ST><LF><ESC>[?25h<ESC>]9;4;0;0;gh-v2.74.2-linux-amd64.tar.gz<ST>"`,
    );
  });
});
