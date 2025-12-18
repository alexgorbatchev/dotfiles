import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import { ExitCode, exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import type {
  ICommandCompletionMeta,
  IFilesCommandSpecificOptions,
  IGlobalProgram,
  IGlobalProgramOptions,
  IServices,
} from './types';

/**
 * Completion metadata for the files command.
 */
export const FILES_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'files',
  description: 'Show generated files structure',
  hasPositionalArg: true,
  positionalArgDescription: 'tool name (optional)',
  positionalArgType: 'tool',
};

interface ITreeNode {
  name: string;
  isDirectory: boolean;
  children?: ITreeNode[];
}

type PrintFunction = (message: string) => void;

async function buildTreeFromDirectory(logger: TsLogger, fs: IFileSystem, dirPath: string): Promise<ITreeNode[]> {
  const nodes: ITreeNode[] = [];

  try {
    const entries = await fs.readdir(dirPath);

    for (const entry of entries) {
      const fullPath: string = `${dirPath}/${entry}`;
      const stats = await fs.stat(fullPath);
      const isDirectory: boolean = stats.isDirectory();

      const node: ITreeNode = {
        name: entry,
        isDirectory,
      };

      if (isDirectory) {
        node.children = await buildTreeFromDirectory(logger, fs, fullPath);
      }

      nodes.push(node);
    }
  } catch (error) {
    logger.error(messages.commandExecutionFailed('files', ExitCode.ERROR), error);
  }

  // Sort: directories first, then files, both alphabetically
  return nodes.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name);
    }
    return a.isDirectory ? -1 : 1;
  });
}

function formatTree(nodes: ITreeNode[], prefix: string = ''): string {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) {
      continue;
    }

    const isLastNode: boolean = i === nodes.length - 1;
    const connector: string = isLastNode ? '└─ ' : '├─ ';
    const displayName: string = node.name;

    lines.push(`${prefix}${connector}${displayName}`);

    if (node.isDirectory && node.children && node.children.length > 0) {
      const childPrefix: string = prefix + (isLastNode ? '   ' : '│  ');
      const childTree = formatTree(node.children, childPrefix);
      lines.push(childTree);
    }
  }

  return lines.join('\n');
}

async function displayTreeForTool(
  logger: TsLogger,
  toolName: string,
  fs: IFileSystem,
  toolInstallationRegistry: IToolInstallationRegistry,
  print: PrintFunction
): Promise<ExitCode> {
  const installation = await toolInstallationRegistry.getToolInstallation(toolName);

  if (!installation) {
    logger.error(messages.toolNotInstalled(toolName));
    return ExitCode.ERROR;
  }

  const installPath: string = installation.installPath;
  const exists: boolean = await fs.exists(installPath);

  if (!exists) {
    logger.error(messages.installPathNotFound(installPath));
    return ExitCode.ERROR;
  }

  // Display the full path first
  print(installPath);

  // Build and display the tree
  const tree = await buildTreeFromDirectory(logger, fs, installPath);

  if (tree.length === 0) {
    print('(empty directory)');
    return ExitCode.SUCCESS;
  }

  const treeOutput = formatTree(tree);
  print(treeOutput);

  return ExitCode.SUCCESS;
}

async function filesActionLogic(
  logger: TsLogger,
  toolName: string,
  _options: IFilesCommandSpecificOptions & IGlobalProgramOptions,
  services: IServices,
  print: PrintFunction
): Promise<void> {
  const { fs, projectConfig, configService, toolInstallationRegistry } = services;

  try {
    const toolConfig = await configService.loadSingleToolConfig(
      logger,
      toolName,
      projectConfig.paths.toolConfigsDir,
      fs,
      projectConfig
    );

    if (!toolConfig) {
      logger.error(messages.toolNotFound(toolName, projectConfig.paths.toolConfigsDir));
      exitCli(ExitCode.ERROR);
      return;
    }

    const exitCode = await displayTreeForTool(logger, toolName, fs, toolInstallationRegistry, print);
    if (exitCode !== ExitCode.SUCCESS) {
      exitCli(exitCode);
    }
  } catch (error) {
    logger.error(messages.commandExecutionFailed('files', ExitCode.ERROR), error);
    exitCli(ExitCode.ERROR);
  }
}

export function registerFilesCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>,
  // biome-ignore lint/suspicious/noConsole: default print function
  print: PrintFunction = console.log
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerFilesCommand' });

  program
    .command('files <toolName>')
    .description('Display a tree view of files in the tool installation directory')
    .action(async (toolName: string, commandOptions: IFilesCommandSpecificOptions) => {
      const combinedOptions: IFilesCommandSpecificOptions & IGlobalProgramOptions = {
        ...commandOptions,
        ...program.opts(),
      };
      const services = await servicesFactory();
      await filesActionLogic(logger, toolName, combinedOptions, services, print);
    });
}
