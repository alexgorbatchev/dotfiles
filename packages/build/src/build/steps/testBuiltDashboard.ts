import path from 'node:path';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

const TEST_PORT = 13579;
const STARTUP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

/**
 * Tests the built CLI's dashboard command by starting it and verifying HTTP responses.
 *
 * ## Important: Working Directory
 *
 * The server process MUST run from the `.dist/` output directory (via `cwd` option).
 * This is because Bun's HTML import feature generates chunk files (like `dashboard-*.js`)
 * that are referenced with relative paths. If the process runs from a different directory,
 * it will fail to find these chunk files.
 *
 * ## Test Flow
 *
 * 1. Spawns the built CLI with `dashboard` command
 * 2. Polls `/api/health` until the server is ready (or timeout)
 * 3. Verifies `/api/health` returns valid JSON
 * 4. Verifies `/` returns HTML content
 * 5. Kills the server process
 */
export async function testBuiltDashboard(context: IBuildContext): Promise<void> {
  console.log('🧪 Testing built dashboard...');

  const testConfigPath = path.join(context.paths.rootDir, 'test-project', 'config.ts');

  // IMPORTANT: cwd must be the output directory where chunk files are located.
  // The dashboard uses Bun's HTML import which generates chunks like `dashboard-*.js`.
  // These are referenced with relative paths, so the process must run from .dist/.
  const serverProcess = Bun.spawn({
    cmd: ['bun', context.paths.cliOutputFile, '--config', testConfigPath, 'dashboard', '--port', String(TEST_PORT)],
    cwd: context.paths.outputDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    await waitForServerReady(TEST_PORT, serverProcess);

    await verifyApiEndpoint(TEST_PORT);
    await verifyHtmlEndpoint(TEST_PORT);

    console.log('✅ Dashboard test passed');
  } finally {
    serverProcess.kill();
    await serverProcess.exited;
  }
}

async function waitForServerReady(port: number, serverProcess: ReturnType<typeof Bun.spawn>): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
    // Check if process exited early
    if (serverProcess.exitCode !== null) {
      const stderr = await new Response(serverProcess.stderr).text();
      const stdout = await new Response(serverProcess.stdout).text();
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

  // Capture output on timeout
  serverProcess.kill();
  const stderr = await new Response(serverProcess.stderr).text();
  const stdout = await new Response(serverProcess.stdout).text();
  throw new BuildError(
    `Dashboard failed to start within ${STARTUP_TIMEOUT_MS}ms\nstderr: ${stderr}\nstdout: ${stdout}`,
  );
}

async function verifyApiEndpoint(port: number): Promise<void> {
  const response = await fetch(`http://localhost:${port}/api/health`);

  if (!response.ok) {
    throw new BuildError(`Dashboard API returned status ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type');
  if (!contentType?.includes('application/json')) {
    throw new BuildError(`Dashboard API returned wrong content type: ${contentType}`);
  }

  const data = (await response.json()) as { success?: boolean; };
  if (!data.success) {
    throw new BuildError('Dashboard API health check failed');
  }
}

async function verifyHtmlEndpoint(port: number): Promise<void> {
  const response = await fetch(`http://localhost:${port}/`);

  if (!response.ok) {
    throw new BuildError(`Dashboard root returned status ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type');
  if (!contentType?.includes('text/html')) {
    throw new BuildError(`Dashboard root returned wrong content type: ${contentType}`);
  }

  const html = await response.text();
  if (!html.includes('<!DOCTYPE html>')) {
    throw new BuildError('Dashboard root did not return valid HTML');
  }

  if (!html.includes('Dotfiles Dashboard')) {
    throw new BuildError('Dashboard HTML missing expected title');
  }
}
