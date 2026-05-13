import { Architecture, Platform } from "@dotfiles/core";
import { beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { TestHarness } from "./helpers/TestHarness";

describe("E2E: dnf installer", () => {
  const harness = new TestHarness({
    testDir: import.meta.dir,
    configPath: "fixtures/dnf/config.ts",
    platform: Platform.Linux,
    architecture: Architecture.X86_64,
  });
  const fixtureDir = path.join(import.meta.dir, "fixtures", "dnf");
  const fakeBinDir = path.join(fixtureDir, "fake-bin");
  const fakeDnfLog = path.join(harness.generatedDir, "fake-dnf.log");

  beforeAll(async () => {
    await harness.clean();
    await fs.mkdir(harness.generatedDir, { recursive: true });
  });

  it("installs a configured DNF package through the CLI", async () => {
    const result = await harness.install(["dnf-tool"], [], {
      env: {
        PATH: `${fakeBinDir}:${process.env["PATH"] ?? ""}`,
        FAKE_DNF_LOG: fakeDnfLog,
      },
    });

    const normalizedStdout = result.stdout
      .replaceAll(harness.generatedDir, "<generated>")
      .replaceAll(fixtureDir, "<fixture>");

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(normalizedStdout).toMatchInlineSnapshot(`
      "WARN	Platform overridden to: linux
      WARN	Arch overridden to: x86_64
      INFO	[dnf-tool] mkdir <generated>/binaries/dnf-tool
      INFO	[dnf-tool] Executing command: dnf makecache
      INFO	[dnf-tool] Executing command: dnf install -y ripgrep-13.0.0-1.fc40
      INFO	[dnf-tool] mkdir <generated>/binaries/dnf-tool/external
      INFO	[system] ln -s <fixture>/fake-bin/rg <generated>/binaries/dnf-tool/external/rg
      INFO	[dnf-tool] ln -s external <generated>/binaries/dnf-tool/current
      INFO	Tool "dnf-tool" \`13.0.0-1.fc40\` installed successfully using dnf"
    `);

    const log = await fs.readFile(fakeDnfLog, "utf8");
    expect(log).toMatchInlineSnapshot(`
      "dnf makecache
      dnf install -y ripgrep-13.0.0-1.fc40
      "
    `);
  });
});
