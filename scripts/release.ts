#!/usr/bin/env bun

/**
 * Release Script
 *
 * Orchestrates the complete release process: version bump, build, and publish.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "dax-sh";

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function logError(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function getRepoRoot(): string {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));
  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (packageJson.workspaces) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error("Could not find repository root");
}

process.chdir(getRepoRoot());

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

function readCurrentVersion(): string {
  const content = fs.readFileSync(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(content);
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
  const result = await $`${args}`.cwd(cwd).env(mergedEnv).quiet().noThrow();

  if (result.code !== 0) {
    const stdout = result.stdout.toString().trim();
    const stderr = result.stderr.toString().trim();
    const details = [stderr && `stderr:\n${stderr}`, stdout && `stdout:\n${stdout}`].filter(Boolean).join("\n\n");
    throw new Error(`Command failed (exit code ${result.code}): ${command}\n${details}`);
  }
}

async function bumpVersion(bumpType: VersionBumpType): Promise<string> {
  const previousVersion = readCurrentVersion();
  log(`📦 Current version: ${previousVersion}`);
  log(`🔄 Bumping ${bumpType} version...`);

  if (previousVersion === bumpType) {
    log(`ℹ️ Version is already ${bumpType}, skipping bump.`);
    return previousVersion;
  }

  await executeCommand(["bun", "pm", "version", bumpType, "--no-git-tag-version"]);
  const newVersion = readCurrentVersion();
  log(`✅ Version bumped: ${previousVersion} → ${newVersion}`);
  return newVersion;
}

async function revertVersionChange(): Promise<void> {
  log("🔄 Reverting version change...");
  await executeCommand(["git", "checkout", "package.json"]);
  log("✅ Version change reverted");
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
  const result = await Bun.$`git status --porcelain`.quiet().nothrow();
  return result.stdout.toString().trim().length > 0;
}

function verifyPublicReadme(): void {
  const releaseReadmePath = path.join(distDir, "README.md");
  if (!fs.existsSync(releaseReadmePath)) {
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

  let newVersion: string | undefined;
  let didBumpVersion = false;

  try {
    const previousVersion = readCurrentVersion();
    newVersion = await bumpVersion(bumpType);
    didBumpVersion = newVersion !== previousVersion;

    await runBuild();
    verifyPublicReadme();

    if (dryRun) {
      if (didBumpVersion) await revertVersionChange();
      log(`\n✅ Dry run complete — build succeeded for version ${newVersion}.`);
      return;
    }

    await commitAndTag(newVersion, didBumpVersion);
    await pushRelease(newVersion);
    log(`\n🎉 Version updated, tagged, and pushed!`);
  } catch (error) {
    logError(`\n❌ Release push failed: ${error instanceof Error ? error.message : String(error)}`);
    if (newVersion && didBumpVersion && !dryRun) {
      await revertVersionChange();
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  release();
}
