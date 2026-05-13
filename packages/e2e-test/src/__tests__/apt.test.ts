import { Architecture, Platform } from "@dotfiles/core";
import { beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { TestHarness } from "./helpers/TestHarness";

describe("E2E: apt installer", () => {
  const harness = new TestHarness({
    testDir: import.meta.dir,
    configPath: "fixtures/apt/config.ts",
    platform: Platform.Linux,
    architecture: Architecture.X86_64,
  });
  const fixtureDir = path.join(import.meta.dir, "fixtures", "apt");
  const fakeBinDir = path.join(fixtureDir, "fake-bin");
  const fakeAptLog = path.join(harness.generatedDir, "fake-apt.log");

  beforeAll(async () => {
    await harness.clean();
    await fs.mkdir(harness.generatedDir, { recursive: true });
  });

  it("installs a configured APT package through the CLI", async () => {
    const result = await harness.install(["apt-tool"], [], {
      env: {
        PATH: `${fakeBinDir}:${process.env["PATH"] ?? ""}`,
        FAKE_APT_LOG: fakeAptLog,
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
      INFO	[apt-tool] mkdir <generated>/binaries/apt-tool
      INFO	[apt-tool] Executing command: apt-get update
      INFO	[apt-tool] Executing command: apt-get install -y ripgrep=13.0.0-1
      INFO	[apt-tool] mkdir <generated>/binaries/apt-tool/external
      INFO	[system] ln -s <fixture>/fake-bin/rg <generated>/binaries/apt-tool/external/rg
      INFO	[apt-tool] ln -s external <generated>/binaries/apt-tool/current
      INFO	Tool "apt-tool" \`13.0.0-1\` installed successfully using apt"
    `);

    const log = await fs.readFile(fakeAptLog, "utf8");
    expect(log).toMatchInlineSnapshot(`
      "apt-get update
      apt-get install -y ripgrep=13.0.0-1
      dpkg-query -W -f=\${Version} ripgrep
      "
    `);
  });
});
