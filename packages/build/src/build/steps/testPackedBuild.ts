import path from "node:path";
import { BuildError } from "../handleBuildError";
import { createPackedTestEnvironment, type IPackedTestEnvironment, shell } from "../helpers";
import type { IBuildContext } from "../types";

const DASHBOARD_TEST_PORT = 13579;
const STARTUP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

type BunProcess = ReturnType<typeof Bun.spawn>;

interface IProcessOutput {
  stdout: string;
  stderr: string;
}

interface IEndpointVerification {
  url: string;
  expectedContentType: string;
  label: string;
  validateContent?: (content: string) => string | null;
}

type HealthResponseLike = { success?: boolean };

/**
 * Tests the built package by:
 * 1. Running `npm pack` on .dist to create a tarball
 * 2. Unpacking into an isolated directory
 * 3. Running `bun install` to install dependencies
 * 4. Running CLI and Dashboard tests from the packed environment
 *
 * This ensures tests run against the exact files that would be published,
 * catching issues like missing files in the `files` array.
 */
export async function testPackedBuild(context: IBuildContext): Promise<void> {
  console.log("📦 Creating packed test environment...");

  const packedEnv = await createPackedTestEnvironment(context);

  try {
    await testCliFromPackedEnv(packedEnv);
    await testDashboardFromPackedEnv(context, packedEnv);
    console.log("✅ Packed build tests passed");
  } finally {
    packedEnv.cleanup();
  }
}

async function testCliFromPackedEnv(packedEnv: IPackedTestEnvironment): Promise<void> {
  console.log("🧪 Testing CLI from packed environment...");

  const testResult = await shell`bun ${packedEnv.cliPath} --version`.quiet().noThrow();

  if (testResult.code !== 0) {
    throw new BuildError(`CLI test failed with exit code ${testResult.code}: ${testResult.stderr.toString()}`);
  }

  console.log(`✅ CLI test passed - version: ${testResult.stdout.toString().trim()}`);
}

async function testDashboardFromPackedEnv(context: IBuildContext, packedEnv: IPackedTestEnvironment): Promise<void> {
  console.log("🧪 Testing dashboard from packed environment...");

  const testConfigPath = path.join(context.paths.rootDir, "test-project-npm", "dotfiles.config.ts");

  // Run from a directory outside the package to simulate real user behavior
  // The dashboard must resolve its chunks from import.meta.dir
  const serverProcess = Bun.spawn({
    cmd: [
      "bun",
      packedEnv.cliPath,
      "--config",
      testConfigPath,
      "dashboard",
      "--port",
      String(DASHBOARD_TEST_PORT),
      "--no-open",
    ],
    cwd: context.paths.rootDir, // Run from repo root, not package dir
    stdout: "inherit",
    stderr: "inherit",
  });

  try {
    await waitForServerReady(DASHBOARD_TEST_PORT, serverProcess);
    await verifyApiEndpoint(DASHBOARD_TEST_PORT);
    await verifyHtmlEndpoint(DASHBOARD_TEST_PORT);
    await verifyJsChunkEndpoint(DASHBOARD_TEST_PORT, packedEnv.testDir);
    await verifyCssChunkEndpoint(DASHBOARD_TEST_PORT, packedEnv.testDir);

    console.log("✅ Dashboard test passed");
  } finally {
    serverProcess.kill();
    await serverProcess.exited;
  }
}

async function getProcessOutput(process: BunProcess): Promise<IProcessOutput> {
  const stderr = process.stderr instanceof ReadableStream ? await new Response(process.stderr).text() : "";
  const stdout = process.stdout instanceof ReadableStream ? await new Response(process.stdout).text() : "";
  return { stdout, stderr };
}

async function waitForServerReady(port: number, serverProcess: BunProcess): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
    if (serverProcess.exitCode !== null) {
      const { stdout, stderr } = await getProcessOutput(serverProcess);
      throw new BuildError(
        `Dashboard process exited with code ${serverProcess.exitCode}\nstderr: ${stderr}\nstdout: ${stdout}`,
      );
    }

    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }

  serverProcess.kill();
  const { stdout, stderr } = await getProcessOutput(serverProcess);
  throw new BuildError(
    `Dashboard failed to start within ${STARTUP_TIMEOUT_MS}ms\nstderr: ${stderr}\nstdout: ${stdout}`,
  );
}

async function verifyEndpoint(config: IEndpointVerification): Promise<string> {
  const response = await fetch(config.url);

  if (!response.ok) {
    throw new BuildError(`${config.label} returned status ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type");
  if (!contentType?.includes(config.expectedContentType)) {
    throw new BuildError(`${config.label} returned wrong content type: ${contentType}`);
  }

  const content = await response.text();

  if (config.validateContent) {
    const error = config.validateContent(content);
    if (error) {
      throw new BuildError(error);
    }
  }

  return content;
}

async function verifyApiEndpoint(port: number): Promise<void> {
  const content = await verifyEndpoint({
    url: `http://localhost:${port}/api/health`,
    expectedContentType: "application/json",
    label: "Dashboard API",
  });

  const data: HealthResponseLike = JSON.parse(content);
  if (!data.success) {
    throw new BuildError("Dashboard API health check failed");
  }
}

async function verifyHtmlEndpoint(port: number): Promise<void> {
  await verifyEndpoint({
    url: `http://localhost:${port}/`,
    expectedContentType: "text/html",
    label: "Dashboard root",
    validateContent: (html) => {
      if (!html.toLowerCase().includes("<!doctype html>")) {
        return "Dashboard root did not return valid HTML";
      }
      if (!html.includes("Dotfiles Dashboard")) {
        return "Dashboard HTML missing expected title";
      }
      return null;
    },
  });
}

async function findChunkFile(testDir: string, pattern: string, isJavaScript: boolean): Promise<string> {
  const glob = new Bun.Glob(pattern);

  for await (const file of glob.scan(testDir)) {
    if (!isJavaScript) {
      return file;
    }

    // For JS, verify it's actual JavaScript (not CSS with .js extension)
    const filePath = `${testDir}/${file}`;
    const content = await Bun.file(filePath).text();
    const jsStarters = ["import", "export", "var ", "const ", "let ", "function"];
    if (jsStarters.some((starter) => content.startsWith(starter))) {
      return file;
    }
  }

  const assetType = isJavaScript ? "JavaScript" : "CSS";
  throw new BuildError(`No dashboard ${assetType} chunks found in packed directory: ${testDir}`);
}

function validateNotHtml(content: string, label: string): string | null {
  if (content.startsWith("<!DOCTYPE") || content.startsWith("<html")) {
    return `${label} returned HTML instead of expected content`;
  }
  return null;
}

async function verifyJsChunkEndpoint(port: number, testDir: string): Promise<void> {
  const jsChunkFile = await findChunkFile(testDir, "dashboard-*.js", true);

  await verifyEndpoint({
    url: `http://localhost:${port}/${jsChunkFile}`,
    expectedContentType: "javascript",
    label: `Dashboard JS chunk ${jsChunkFile}`,
    validateContent: (content) => validateNotHtml(content, `Dashboard JS chunk ${jsChunkFile}`),
  });
}

async function verifyCssChunkEndpoint(port: number, testDir: string): Promise<void> {
  const cssChunkFile = await findChunkFile(testDir, "dashboard-*.css", false);

  await verifyEndpoint({
    url: `http://localhost:${port}/${cssChunkFile}`,
    expectedContentType: "text/css",
    label: `Dashboard CSS chunk ${cssChunkFile}`,
    validateContent: (content) => validateNotHtml(content, `Dashboard CSS chunk ${cssChunkFile}`),
  });
}
