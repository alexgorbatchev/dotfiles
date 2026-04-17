import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Architecture, Platform } from "@dotfiles/core";
import fs from "node:fs";
import path from "node:path";
import { withMockServer } from "./helpers/mock-server";
import { TestHarness } from "./helpers/TestHarness";

const ALLOW_NON_MACOS_ENV_VAR = "DOTFILES_TEST_PKG_ALLOW_NON_MACOS";
const INSTALLER_PATH_ENV_VAR = "DOTFILES_TEST_PKG_INSTALLER_PATH";
const TEST_BINARY_PATH_ENV_VAR = "DOTFILES_TEST_PKG_BINARY_PATH";
const hostArchitecture = process.arch === "x64" ? Architecture.X86_64 : Architecture.Arm64;
const fixtureDir = path.join(import.meta.dir, "fixtures", "pkg");
const pkgAssetPath = path.join(fixtureDir, "assets", "pkg-test-tool.pkg");
const fakeInstallerPath = path.join(fixtureDir, "build", "fake-installer.sh");
const fakeInstallerLogPath = path.join(fixtureDir, "build", "fake-installer.log");

describe("E2E: pkg installer", () => {
  withMockServer((builder) => builder.withBinary("/pkg-test-tool.pkg", "assets/pkg-test-tool.pkg"), "pkg");

  const harness = new TestHarness({
    testDir: import.meta.dir,
    configPath: "fixtures/pkg/config.ts",
    platform: Platform.MacOS,
    architecture: hostArchitecture,
  });
  const installRootDir = path.join(harness.generatedDir, "pkg-install-root");
  const installedBinaryPath = path.join(installRootDir, "bin", "pkg-test-tool");

  beforeAll(async () => {
    await cleanupFixtureBuild();
    await createFakeInstallerFixture();
    await harness.clean();
    const generateResult = await harness.runCommand(["generate", "--config", harness.configPath], {
      env: { [TEST_BINARY_PATH_ENV_VAR]: installedBinaryPath },
    });
    expect(generateResult.code).toBe(0);
    await harness.cleanBinaries();
  });

  afterAll(async () => {
    await Promise.all([harness.clean(), cleanupFixtureBuild()]);
  });

  it("installs a pkg payload and exposes it through the current entrypoint", async () => {
    const currentBinaryPath = path.join(harness.generatedDir, "binaries", "pkg-test-tool", "current", "pkg-test-tool");
    const shimPath = harness.getShimPath("pkg-test-tool");

    expect(await harness.fileExists(installedBinaryPath)).toBe(false);
    expect(await harness.fileExists(currentBinaryPath)).toBe(false);

    const installResult = await harness.runCommand(["install", "--config", harness.configPath, "pkg-test-tool"], {
      env: {
        [ALLOW_NON_MACOS_ENV_VAR]: "1",
        [INSTALLER_PATH_ENV_VAR]: fakeInstallerPath,
        [TEST_BINARY_PATH_ENV_VAR]: installedBinaryPath,
      },
    });
    expect(installResult.code).toBe(0);

    let fakeInstallerLog = "<missing>";
    try {
      fakeInstallerLog = await fs.promises.readFile(fakeInstallerLogPath, "utf8");
    } catch {
      throw new Error(
        [
          `Fake installer did not run: ${fakeInstallerLogPath}`,
          `stdout: ${installResult.stdout}`,
          `stderr: ${installResult.stderr}`,
        ].join("\n"),
      );
    }

    const installedBinaryExists = await harness.fileExists(installedBinaryPath);
    if (!installedBinaryExists) {
      throw new Error(
        [
          `Missing installed binary at ${installedBinaryPath}`,
          `stdout: ${installResult.stdout}`,
          `stderr: ${installResult.stderr}`,
          `installer log: ${fakeInstallerLog}`,
        ].join("\n"),
      );
    }

    expect(installedBinaryExists).toBe(true);
    expect(await harness.isExecutable(installedBinaryPath)).toBe(true);
    expect(await harness.fileExists(currentBinaryPath)).toBe(true);
    expect(await harness.fileExists(shimPath)).toBe(false);

    const proc = Bun.spawn({
      cmd: [currentBinaryPath, "--version"],
      cwd: harness.testDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NO_COLOR: "1",
        TERM: "dumb",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(code).toBe(0);
    expect(stderr.trim()).toBe("");
    expect(stdout.trim()).toBe("1.0.0");
  });
});

async function createFakeInstallerFixture(): Promise<void> {
  await fs.promises.rm(path.join(fixtureDir, "build"), { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(fakeInstallerPath), { recursive: true });
  await fs.promises.mkdir(path.dirname(pkgAssetPath), { recursive: true });

  await fs.promises.writeFile(
    pkgAssetPath,
    [
      "#!/usr/bin/env bash",
      'if [ "${1:-}" = "--version" ]; then',
      '  echo "1.0.0"',
      "  exit 0",
      "fi",
      'echo "pkg-test-tool"',
    ].join("\n"),
    "utf8",
  );
  await fs.promises.chmod(pkgAssetPath, 0o755);

  await fs.promises.writeFile(
    fakeInstallerPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "pkg_path=''",
      "target=''",
      "while [ $# -gt 0 ]; do",
      '  case "$1" in',
      "    -pkg)",
      '      pkg_path="$2"',
      "      shift 2",
      "      ;;",
      "    -target)",
      '      target="$2"',
      "      shift 2",
      "      ;;",
      "    *)",
      "      shift",
      "      ;;",
      "  esac",
      "done",
      'test -n "$pkg_path"',
      'test "$target" = "/"',
      `dest="\${${TEST_BINARY_PATH_ENV_VAR}:-}"`,
      'test -n "$dest"',
      `log_path="${fakeInstallerLogPath}"`,
      'mkdir -p "$(dirname "$log_path")"',
      'printf "pkg_path=%s\ntarget=%s\ndest=%s\n" "$pkg_path" "$target" "$dest" > "$log_path"',
      'mkdir -p "$(dirname "$dest")"',
      'cp "$pkg_path" "$dest"',
      'chmod +x "$dest"',
    ].join("\n"),
    "utf8",
  );
  await fs.promises.chmod(fakeInstallerPath, 0o755);
}

async function cleanupFixtureBuild(): Promise<void> {
  await fs.promises.rm(path.join(fixtureDir, "build"), { recursive: true, force: true });
}
