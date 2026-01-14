import fs from 'node:fs';
import {
  printBundledModuleAnalysis,
  printExternalModuleAnalysis,
  shouldExternalizeNonDotfilesBareImport,
} from '../bundle-helpers';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

/**
 * Builds the CLI bundle into the output directory and prints a post-build dependency analysis.
 */
export async function buildCli(context: IBuildContext): Promise<Bun.BuildOutput> {
  console.log('🏗️  Building CLI...');
  console.log(`📍 Entry: ${context.paths.entryPoint}`);
  console.log(`📦 Output: ${context.paths.cliOutputFile}`);

  const externalizeNonDotfilesPackagesPlugin: Bun.BunPlugin = {
    name: 'externalize-non-dotfiles-packages',
    setup(build: Bun.PluginBuilder) {
      build.onResolve({ filter: /.*/ }, (args: Bun.OnResolveArgs) => {
        const specifier: string = args.path;

        if (!shouldExternalizeNonDotfilesBareImport(specifier)) {
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

  const result = await Bun.build({
    entrypoints: [context.paths.entryPoint],
    outdir: context.paths.outputDir,
    naming: 'cli.js',
    minify: true,
    sourcemap: 'external',
    target: 'bun',
    format: 'esm',
    splitting: false,
    plugins: [externalizeNonDotfilesPackagesPlugin],
    define: {
      'import.meta.main': 'true',
    },
    env: 'inline',
  });

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
