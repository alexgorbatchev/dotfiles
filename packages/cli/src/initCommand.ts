import { join } from 'node:path';
import type { TsLogger } from '@dotfiles/logger';
import { dedentString, exitCli, getCliBinPath } from '@dotfiles/utils';
import { cliLogMessages } from './log-messages';
import type { GlobalProgram, Services } from './types';

export function registerInitCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerInitCommand' });
  program
    .command('init')
    .description('Initialize a new dotfiles generator project')
    .action(async () => {
      logger.debug(cliLogMessages.commandActionCalled('init'));

      try {
        const services = await servicesFactory();
        const { fs } = services;

        const files = ['generator.d.ts', 'tsconfig.json', 'config.yaml', 'tools/fzf.tool.ts'];

        // Check if any files already exist
        const existingFiles: string[] = [];
        for (const file of files) {
          if (await fs.exists(file)) {
            existingFiles.push(file);
          }
        }

        if (existingFiles.length > 0) {
          logger.error(cliLogMessages.initExistingFiles(existingFiles.join(', ')));
          logger.error(cliLogMessages.operationFailed('init'));
          exitCli(1);
          return;
        }

        // Create generator.d.ts - copy the pre-built file
        const cliBinPath = getCliBinPath();
        const generatedDtsPath = join(cliBinPath, '../generator.d.ts');

        if (await fs.exists(generatedDtsPath)) {
          const generatedDts = await fs.readFile(generatedDtsPath, 'utf8');
          await fs.writeFile('generator.d.ts', generatedDts);
        } else {
          logger.error(cliLogMessages.operationFailed('init'));
          exitCli(1);
          return;
        }
        // Create tsconfig.json
        const tsconfig = {
          compilerOptions: {
            baseUrl: './',
            lib: ['ESNext', 'DOM'],
            target: 'ESNext',
            module: 'ESNext',
            moduleDetection: 'force',
            allowJs: true,
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            verbatimModuleSyntax: true,
            noEmit: true,
            esModuleInterop: true,
            strict: true,
            skipLibCheck: true,
            noFallthroughCasesInSwitch: true,
            noUncheckedIndexedAccess: true,
            types: ['bun-types', 'node'],
            noUnusedLocals: true,
            noUnusedParameters: true,
            noPropertyAccessFromIndexSignature: true,
            noImplicitAny: true,
            paths: {
              '@generator': ['./generator.d.ts'],
            },
          },
          include: ['**/*.ts'],
          exclude: ['node_modules', 'dist'],
        };

        await fs.writeFile('tsconfig.json', JSON.stringify(tsconfig, null, 2));

        // Create config.yaml
        const configYaml = dedentString(`
          # Dotfiles Generator Configuration
          # See documentation for available options

          paths:
            generatedDir: ./demo
            toolConfigsDir: ./tools
        `);

        await fs.writeFile('config.yaml', configYaml);

        // Create tools directory and fzf.tool.ts
        await fs.ensureDir('tools');

        const fzfToolConfig = dedentString(`
          import type { ToolConfigBuilder, ToolConfigContext } from '@generator';
          
          export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
            c
              .bin('fzf')
              .version('latest')
              .install('github-release', {
                repo: 'junegunn/fzf',
              })
              .zsh({
                completions: { source: 'shell/completion.zsh' },
                environment: {
                  'FZF_DEFAULT_OPTS': '--color=fg+:cyan,bg+:black,hl+:yellow,pointer:blue'
                },
                aliases: {
                  'fzf': 'fzf'
                }
              });
          };
        `);

        await fs.writeFile('tools/fzf.tool.ts', fzfToolConfig);

        logger.info(cliLogMessages.initProjectInitialized());
        logger.info(cliLogMessages.initFilesCreated('generator.d.ts, tsconfig.json, config.yaml, tools/fzf.tool.ts'));
      } catch (error) {
        logger.error(cliLogMessages.operationFailed('project initialization'));
        logger.debug(cliLogMessages.commandErrorDetails(), error);
        exitCli(1);
      }
    });
}
