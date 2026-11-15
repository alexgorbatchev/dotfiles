#!/usr/bin/env bun

import path from "node:path";

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function logError(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

async function getRepoRoot(): Promise<string> {
  let currentDir = import.meta.dir;
  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (await Bun.file(packageJsonPath).exists()) {
      const packageJson = await Bun.file(packageJsonPath).json();
      if (packageJson.workspaces) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error("Could not find repository root");
}

process.chdir(await getRepoRoot());

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const distDir = path.join(rootDir, ".dist");

type VersionBumpType = "patch" | "minor" | "major" | string;

function isValidBumpType(value: string): value is VersionBumpType {
  return (
    value === "patch" ||
    value === "minor" ||
    value === "major" ||
    /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(value)
  );
}

async function readCurrentVersion(): Promise<string> {
  const packageJson = await Bun.file(packageJsonPath).json();
  return packageJson.version;
}

interface IExecuteCommandOptions {
  cwd?: string;
  env?: Record<string, string>;
}

async function executeCommand(args: string[], opts: IExecuteCommandOptions = {}): Promise<void> {
  const { cwd = process.cwd(), env } = opts;
  const command = args.join(" ");
  const mergedEnv = env ? { ...process.env, ...env } : process.env;
  const proc = Bun.spawn(args, {
    cwd,
    env: mergedEnv,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stdout = (await stdoutPromise).trim();
    const stderr = (await stderrPromise).trim();
    const details = [stderr && `stderr:\n${stderr}`, stdout && `stdout:\n${stdout}`].filter(Boolean).join("\n\n");
    throw new Error(`Command failed (exit code ${exitCode}): ${command}\n${details}`);
  }
}

async function bumpVersion(bumpType: VersionBumpType): Promise<string> {
  const previousVersion = await readCurrentVersion();
  log(`📦 Current version: ${previousVersion}`);
  log(`🔄 Bumping ${bumpType} version...`);

  if (previousVersion === bumpType) {
    log(`ℹ️ Version is already ${bumpType}, skipping bump.`);
    return previousVersion;
  }

  await executeCommand(["bun", "pm", "version", bumpType, "--no-git-tag-version"]);
  const newVersion = await readCurrentVersion();
  log(`✅ Version bumped: ${previousVersion} → ${newVersion}`);
  return newVersion;
}

async function revertVersionChange(originalPackage: string): Promise<void> {
  if ((await Bun.file(packageJsonPath).text()) === originalPackage) return;
  log("🔄 Reverting version change...");
  await Bun.write(packageJsonPath, originalPackage);
  log("✅ Version change reverted");
}

async function runValidation(): Promise<void> {
  log("🔎 Preparing and validating the release...");
  await executeCommand(["just", "setup"]);
  await executeCommand(["bun", "run", "check"]);
}

async function runBuild(): Promise<void> {
  log("🏗️  Running compile...");
  await executeCommand(["bun", "run", "compile"]);
}

async function commitAndTag(version: string, didBump: boolean): Promise<void> {
  if (didBump) {
    log("📝 Committing version change...");
    await executeCommand(["git", "add", "package.json"]);
    await executeCommand(["git", "commit", "-m", `Version ${version}`]);
  }
  log(`📝 Creating tag v${version}...`);
  await executeCommand(["git", "tag", `v${version}`]);
  log(`✅ Created tag v${version}`);
}

async function pushRelease(version: string): Promise<void> {
  log("🚀 Pushing release commit and tag...");
  await executeCommand(["git", "push"]);
  await executeCommand(["git", "push", "origin", `v${version}`]);
  log(`✅ Pushed release commit and tag v${version}`);
}

async function hasUncommittedChanges(): Promise<boolean> {
  const result = await Bun.$`git status --porcelain`.quiet();
  return result.stdout.toString().trim().length > 0;
}

async function verifyPublicReadme(): Promise<void> {
  const releaseReadmePath = path.join(distDir, "README.md");
  if (!(await Bun.file(releaseReadmePath).exists())) {
    throw new Error(`Built README is missing: ${releaseReadmePath}`);
  }
}

async function release(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const bumpType = args.find((arg) => arg !== "--dry-run") ?? "patch";

  if (!isValidBumpType(bumpType)) {
    logError(`Invalid bump type/version: ${bumpType}.`);
    process.exit(1);
  }

  if (dryRun) {
    log("🧪 Dry run mode — will skip commit, tag, and publish.");
  }

  if (!dryRun && (await hasUncommittedChanges())) {
    throw new Error("Working directory is not clean. Release requires a clean git state.");
  }

  const originalPackage = await Bun.file(packageJsonPath).text();
  let shouldRestoreVersion = true;

  try {
    const previousVersion = await readCurrentVersion();
    const newVersion = await bumpVersion(bumpType);
    const didBumpVersion = newVersion !== previousVersion;

    await runValidation();
    await runBuild();
    await verifyPublicReadme();

    if (dryRun) {
      log(`\n✅ Dry run complete — validation and build succeeded for version ${newVersion}.`);
      return;
    }

    // Once integration starts, retain the release state if Git fails so it can
    // be inspected and resumed without rewriting a partially committed release.
    shouldRestoreVersion = false;
    await commitAndTag(newVersion, didBumpVersion);
    await pushRelease(newVersion);
    log(`\n🎉 Version updated, tagged, and pushed!`);
  } catch (error) {
    logError(`\n❌ Release failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (shouldRestoreVersion) await revertVersionChange(originalPackage);
  }
}

if (import.meta.main) {
  release();
}
