import { Architecture, Platform } from "@dotfiles/core";
import { beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { TestHarness } from "./helpers/TestHarness";

describe("E2E: pacman installer", () => {
  const harness = new TestHarness({
    testDir: import.meta.dir,
    configPath: "fixtures/pacman/config.ts",
    platform: Platform.Linux,
    architecture: Architecture.X86_64,
  });
  const fixtureDir = path.join(import.meta.dir, "fixtures", "pacman");
  const fakeBinDir = path.join(fixtureDir, "fake-bin");
  const fakeExactPacmanLog = path.join(harness.generatedDir, "fake-pacman-exact.log");
  const fakeLatestPacmanLog = path.join(harness.generatedDir, "fake-pacman-latest.log");

  beforeAll(async () => {
    await harness.clean();
    await fs.mkdir(harness.generatedDir, { recursive: true });
  });

  it("installs a configured pacman package through the CLI", async () => {
    const result = await harness.install(["pacman-tool"], [], {
      env: {
        PATH: `${fakeBinDir}:${process.env["PATH"] ?? ""}`,
        FAKE_PACMAN_LOG: fakeExactPacmanLog,
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
      INFO	[pacman-tool] mkdir <generated>/binaries/pacman-tool
      INFO	[pacman-tool] Executing command: pacman -Syu --needed --noconfirm ripgrep=13.0.0-1
      INFO	[pacman-tool] mkdir <generated>/binaries/pacman-tool/external
      INFO	[system] ln -s <fixture>/fake-bin/rg <generated>/binaries/pacman-tool/external/rg
      INFO	[pacman-tool] ln -s external <generated>/binaries/pacman-tool/current
      INFO	Tool "pacman-tool" \`13.0.0-1\` installed successfully using pacman"
    `);

    const log = await fs.readFile(fakeExactPacmanLog, "utf8");
    expect(log).toMatchInlineSnapshot(`
      "pacman -Syu --needed --noconfirm ripgrep=13.0.0-1
      "
    `);
  });

  it("reads installed version for repo-qualified pacman targets", async () => {
    const result = await harness.install(["pacman-latest-tool"], [], {
      env: {
        PATH: `${fakeBinDir}:${process.env["PATH"] ?? ""}`,
        FAKE_PACMAN_LOG: fakeLatestPacmanLog,
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
      INFO	[pacman-latest-tool] mkdir <generated>/binaries/pacman-latest-tool
      INFO	[pacman-latest-tool] Executing command: pacman -S --needed --noconfirm extra/ripgrep
      INFO	[pacman-latest-tool] mkdir <generated>/binaries/pacman-latest-tool/external
      INFO	[system] ln -s <fixture>/fake-bin/rg <generated>/binaries/pacman-latest-tool/external/rg
      INFO	[pacman-latest-tool] ln -s external <generated>/binaries/pacman-latest-tool/current
      INFO	Tool "pacman-latest-tool" \`13.0.0-1\` installed successfully using pacman"
    `);

    const log = await fs.readFile(fakeLatestPacmanLog, "utf8");
    expect(log).toMatchInlineSnapshot(`
      "pacman -S --needed --noconfirm extra/ripgrep
      pacman -Q ripgrep
      "
    `);
  });
});
