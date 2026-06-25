import fs from "node:fs";
import type { IBuildContext } from "../types";

const launcherTemplate = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const platform = process.platform;
const arch = process.arch;

let binName = 'dotfiles';
if (platform === 'win32') {
  binName = 'dotfiles.exe';
}

// 1. Check local .dist binary first (useful for local development/compilation testing)
let binaryPath = path.join(__dirname, binName);

// 2. If local binary is missing, resolve path to the optional native platform package
if (!fs.existsSync(binaryPath)) {
  const subPackageName = \`@alexgorbatchev/dotfiles-\${platform}-\${arch}\`;
  try {
    const subPackagePath = path.dirname(import.meta.resolve(subPackageName + '/package.json'));
    binaryPath = path.join(subPackagePath, 'bin', binName);
  } catch {
    console.error(\`Error: Unsupported platform/architecture combination: \${platform}-\${arch}\`);
    process.exit(1);
  }
}

// If running as CLI binary, execute the Go subprocess
if (import.meta.url === \`file://\${process.argv[1]}\` || (process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('dotfiles')))) {
  const result = spawnSync(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: true,
  });
  process.exit(result.status ?? 0);
}

// Export design-time stubs to support Bun/Node configuration imports and evaluation
export function defineConfig(callback) { return callback; }
export function defineTool(callback) { return callback; }
export function dedentString(str) { return str; }
export function dedentTemplate(template, values) { return template; }

export const Platform = Object.freeze({ None: 0, Linux: 1, MacOS: 2, Windows: 4, Unix: 3, All: 7 });
export const Architecture = Object.freeze({ None: 0, X86_64: 1, Arm64: 2, All: 3 });
`;

/**
 * Emits the lightweight platform-detecting JS launcher to .dist/cli.js.
 */
export function writeLauncher(context: IBuildContext): void {
  const launcherPath = context.paths.cliOutputFile;
  fs.writeFileSync(launcherPath, launcherTemplate, "utf8");
  fs.chmodSync(launcherPath, 0o755);
  console.log("✅ Emitted cross-platform launcher cli.js to .dist/!");
}
