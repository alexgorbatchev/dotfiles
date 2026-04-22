#!/usr/bin/env bun
import { $ } from "bun";
import { resolve } from "path";

type AgentBrowserErrorsPayload = {
  data?: {
    errors?: unknown[];
  };
};

function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

/**
 * This script verifies that the compiled production dashboard loads correctly
 * using agent-browser. It checks for JavaScript errors, minifier collisions,
 * and ensures that CDN-loaded dependencies (like Shiki and Marked) are
 * successfully executing and rendering on the page.
 */
async function main() {
  const rootDir = resolve(import.meta.dir, "../../..");

  writeStdout("Starting dashboard...");
  const port = "13580";

  // Start the actual CLI dashboard from the built package
  const proc = Bun.spawn(
    ["bun", ".dist/cli.js", "--config=test-project-npm/dotfiles.config.ts", "dashboard", "--port", port, "--no-open"],
    {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  // Give the dashboard a few seconds to boot up
  await new Promise((r) => setTimeout(r, 4000));

  let failed = false;
  try {
    const url = `http://localhost:${port}/tools/github-release--bat`;
    writeStdout(`Running agent-browser on ${url}...`);

    // Clear previous errors and load the page
    await $`agent-browser errors --clear && agent-browser open "${url}" && agent-browser wait 3000`.quiet();

    // 1. Check for Console Errors
    const errs = await $`agent-browser errors --json`.text();
    const parsedErrs: AgentBrowserErrorsPayload = JSON.parse(errs);
    if (parsedErrs.data && parsedErrs.data.errors && parsedErrs.data.errors.length > 0) {
      writeStderr("Found console errors:");
      writeStderr(JSON.stringify(parsedErrs.data.errors, null, 2));
      failed = true;
    } else {
      writeStdout("No console errors detected.");
    }

    // 2. Check that Shiki Highlighted the Code
    const shikiRendered = await $`agent-browser get html ".shiki"`.text().catch(() => "");
    // If shiki fails to load, our fallback just wraps the text in `<pre class="shiki"><code>...`
    // without injecting all the individual `<span style="color: ...">` syntax tokens.
    if (shikiRendered.includes('style="color:')) {
      writeStdout("Shiki syntax highlighting is working.");
    } else {
      writeStderr("Shiki highlighting failed or didn't render spans.");
      failed = true;
    }

    // 3. Check that Markdown Rendered
    const mdRendered = await $`agent-browser get html ".markdown-body"`.text().catch(() => "");
    // If marked fails to load, our fallback is `<div class="markdown-body"><pre># README...</pre></div>`
    // If it works, it converts `# README` into actual `<h1>`, `<p>`, `<a>` tags etc.
    if (mdRendered.includes("<h") || mdRendered.includes("<p>")) {
      writeStdout("Markdown rendering is working.");
    } else {
      writeStderr("Markdown rendering failed or only output raw text.");
      failed = true;
    }
  } finally {
    proc.kill();
  }

  if (failed) {
    writeStderr("");
    writeStderr("Dashboard verification failed.");
    process.exit(1);
  } else {
    writeStdout("");
    writeStdout("Dashboard verified successfully!");
  }
}

main().catch((error) => {
  writeStderr(`Script crashed: ${formatError(error)}`);
  process.exit(1);
});
