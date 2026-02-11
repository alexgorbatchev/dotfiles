import fs from 'node:fs';
import tailwindPlugin from 'bun-plugin-tailwind';
import {
  printBundledModuleAnalysis,
  printExternalModuleAnalysis,
  shouldExternalizeNonDotfilesBareImport,
} from '../bundle-helpers';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

/**
 * Builds the CLI bundle into the output directory and prints a post-build dependency analysis.
 *
 * Output Structure:
 * - `cli.js` - The CLI entry point bundle
 * - `dashboard.js` - The dashboard HTML entry (processed by Bun at runtime)
 * - `dashboard-*.js` - Dashboard client chunks (Preact components)
 * - `cli-*.js` - Preact runtime chunks used by the dashboard
 */
export async function buildCli(context: IBuildContext): Promise<Bun.BuildOutput> {
  console.log('🏗️  Building CLI...');
  console.log(`📍 Entry: ${context.paths.entryPoint}`);
  console.log(`📦 Output: ${context.paths.cliOutputFile}`);

  const externalizeNonDotfilesPackagesPlugin: Bun.BunPlugin = {
    name: 'externalize-non-dotfiles-packages',
    setup(build: Bun.PluginBuilder) {
      // IMPORTANT: Only intercept bare imports (not starting with . or /)
      // Using /^[^./]/ instead of /.*/ is critical for dashboard HTML imports.
      // The dashboard uses Bun's HTML import feature:
      //   import clientApp from '../client/dashboard.html';
      // A catch-all filter would intercept this relative import and break the build.
      build.onResolve({ filter: /^[^./]/ }, (args: Bun.OnResolveArgs) => {
        const specifier: string = args.path;
        const importer: string = args.importer;

        if (!shouldExternalizeNonDotfilesBareImport(specifier, importer)) {
          return;
        }

        const resolveResult: Bun.OnResolveResult = {
          path: specifier,
          external: true,
        };

        return resolveResult;
      });
    },
  };

  let result: Bun.BuildOutput;

  try {
    result = await Bun.build({
      entrypoints: [context.paths.entryPoint],
      outdir: context.paths.outputDir,
      naming: {
        entry: '[name].js',
        // Use [ext] to preserve correct extension for CSS vs JS chunks
        chunk: '[name]-[hash].[ext]',
        asset: '[name]-[hash].[ext]',
      },
      minify: true,
      sourcemap: 'external',
      target: 'bun',
      format: 'esm',
      // Required for Bun to properly handle HTML imports. When the dashboard server runs,
      // Bun processes the HTML file and generates separate chunks for the client-side code
      // (Preact components). Without splitting, the HTML import mechanism fails.
      splitting: true,
      plugins: [tailwindPlugin, externalizeNonDotfilesPackagesPlugin],
      // Configured for Preact to support the dashboard's Preact-based client.
      // The 'automatic' runtime enables the modern JSX transform.
      jsx: {
        runtime: 'automatic',
        importSource: 'preact',
      },
      define: {
        'import.meta.main': 'true',
        // Set NODE_ENV to production so IS_DEV is false in the dashboard server.
        // This ensures the production code path uses absolute paths for serving files.
        'process.env.NODE_ENV': '"production"',
      },
      env: 'inline',
    });
  } catch (error) {
    console.error('❌ Build threw an exception:');
    console.error(error);
    throw new BuildError('CLI build failed');
  }

  if (!result.success) {
    console.error('❌ Build failed:');
    for (const message of result.logs) {
      console.error(`   ${message.toString()}`);
    }
    throw new BuildError('CLI build failed');
  }

  fs.chmodSync(context.paths.cliOutputFile, 0o755);

  const cliStats = fs.statSync(context.paths.cliOutputFile);
  if (!cliStats.isFile()) {
    throw new BuildError('cli.js output is missing');
  }

  await printBundledModuleAnalysis(context.paths.cliOutputSourceMapFile);
  await printExternalModuleAnalysis(context.paths.cliOutputFile);

  return result;
}
