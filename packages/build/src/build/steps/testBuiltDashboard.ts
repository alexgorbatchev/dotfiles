import path from 'node:path';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

const TEST_PORT = 13579;
const STARTUP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

type BunProcess = ReturnType<typeof Bun.spawn>;

interface ProcessOutput {
  stdout: string;
  stderr: string;
}

interface EndpointVerification {
  url: string;
  expectedContentType: string;
  label: string;
  validateContent?: (content: string) => string | null;
}

async function getProcessOutput(process: BunProcess): Promise<ProcessOutput> {
  const stderr = process.stderr instanceof ReadableStream
    ? await new Response(process.stderr).text()
    : '';
  const stdout = process.stdout instanceof ReadableStream
    ? await new Response(process.stdout).text()
    : '';
  return { stdout, stderr };
}

async function verifyEndpoint(config: EndpointVerification): Promise<string> {
  const response = await fetch(config.url);

  if (!response.ok) {
    throw new BuildError(`${config.label} returned status ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type');
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

async function findChunkFile(outputDir: string, pattern: string, isJavaScript: boolean): Promise<string> {
  const glob = new Bun.Glob(pattern);

  for await (const file of glob.scan(outputDir)) {
    if (!isJavaScript) {
      return file;
    }

    // For JS, verify it's actual JavaScript (not CSS with .js extension)
    const filePath = `${outputDir}/${file}`;
    const content = await Bun.file(filePath).text();
    const jsStarters = ['import', 'export', 'var ', 'const ', 'let ', 'function'];
    if (jsStarters.some((starter) => content.startsWith(starter))) {
      return file;
    }
  }

  const assetType = isJavaScript ? 'JavaScript' : 'CSS';
  throw new BuildError(`No dashboard ${assetType} chunks found in output directory`);
}

function validateNotHtml(content: string, label: string): string | null {
  if (content.startsWith('<!DOCTYPE') || content.startsWith('<html')) {
    return `${label} returned HTML instead of expected content`;
  }
  return null;
}

/**
 * Tests the built CLI's dashboard command by starting it and verifying HTTP responses.
 *
 * ## Dashboard Chunk Resolution
 *
 * The dashboard server internally changes to the package directory (using import.meta.dir)
 * before starting. This ensures Bun can find the chunk files regardless of where the CLI
 * is invoked from.
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

  // Run from the project root (not .dist) to simulate real user behavior.
  // Users run the CLI from arbitrary directories, so chunk resolution
  // must work regardless of CWD.
  const serverProcess = Bun.spawn({
    cmd: [
      'bun',
      context.paths.cliOutputFile,
      '--config',
      testConfigPath,
      'dashboard',
      '--port',
      String(TEST_PORT),
      '--no-open',
    ],
    cwd: context.paths.rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  try {
    await waitForServerReady(TEST_PORT, serverProcess);
    await verifyApiEndpoint(TEST_PORT);
    await verifyHtmlEndpoint(TEST_PORT);
    await verifyJsChunkEndpoint(TEST_PORT, context.paths.outputDir);
    await verifyCssChunkEndpoint(TEST_PORT, context.paths.outputDir);

    console.log('✅ Dashboard test passed');
  } finally {
    serverProcess.kill();
    await serverProcess.exited;
  }
}

async function waitForServerReady(port: number, serverProcess: BunProcess): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
    // Check if process exited early
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

  // Capture output on timeout
  serverProcess.kill();
  const { stdout, stderr } = await getProcessOutput(serverProcess);
  throw new BuildError(
    `Dashboard failed to start within ${STARTUP_TIMEOUT_MS}ms\nstderr: ${stderr}\nstdout: ${stdout}`,
  );
}

async function verifyApiEndpoint(port: number): Promise<void> {
  const content = await verifyEndpoint({
    url: `http://localhost:${port}/api/health`,
    expectedContentType: 'application/json',
    label: 'Dashboard API',
  });

  const data = JSON.parse(content) as { success?: boolean; };
  if (!data.success) {
    throw new BuildError('Dashboard API health check failed');
  }
}

async function verifyHtmlEndpoint(port: number): Promise<void> {
  await verifyEndpoint({
    url: `http://localhost:${port}/`,
    expectedContentType: 'text/html',
    label: 'Dashboard root',
    validateContent: (html) => {
      if (!html.includes('<!DOCTYPE html>')) {
        return 'Dashboard root did not return valid HTML';
      }
      if (!html.includes('Dotfiles Dashboard')) {
        return 'Dashboard HTML missing expected title';
      }
      return null;
    },
  });
}

async function verifyJsChunkEndpoint(port: number, outputDir: string): Promise<void> {
  const jsChunkFile = await findChunkFile(outputDir, 'dashboard-*.js', true);

  await verifyEndpoint({
    url: `http://localhost:${port}/${jsChunkFile}`,
    expectedContentType: 'javascript',
    label: `Dashboard JS chunk ${jsChunkFile}`,
    validateContent: (content) => validateNotHtml(content, `Dashboard JS chunk ${jsChunkFile}`),
  });
}

async function verifyCssChunkEndpoint(port: number, outputDir: string): Promise<void> {
  const cssChunkFile = await findChunkFile(outputDir, 'dashboard-*.css', false);

  await verifyEndpoint({
    url: `http://localhost:${port}/${cssChunkFile}`,
    expectedContentType: 'text/css',
    label: `Dashboard CSS chunk ${cssChunkFile}`,
    validateContent: (content) => validateNotHtml(content, `Dashboard CSS chunk ${cssChunkFile}`),
  });
}
