import { dedentTemplate } from '@dotfiles/utils';
import { CHECK_UPDATES_COMMAND_COMPLETION } from './checkUpdatesCommand';
import { CLEANUP_COMMAND_COMPLETION } from './cleanupCommand';
import { GLOBAL_OPTIONS_COMPLETION } from './createProgram';
import { DETECT_CONFLICTS_COMMAND_COMPLETION } from './detectConflictsCommand';
import { DOCS_COMMAND_COMPLETION } from './docsCommand';
import { FEATURES_COMMAND_COMPLETION } from './featuresCommand';
import { FILES_COMMAND_COMPLETION } from './filesCommand';
import { GENERATE_COMMAND_COMPLETION } from './generateCommandCompletion';
import { INSTALL_COMMAND_COMPLETION } from './installCommand';
import { LOG_COMMAND_COMPLETION } from './logCommand';
import type { CompletionPositionalArgType, ICommandCompletionMeta, ICompletionOption } from './types';
import { UPDATE_COMMAND_COMPLETION } from './updateCommand';

/**
 * All command completion metadata collected from individual command files.
 */
export const ALL_COMMAND_COMPLETIONS: ICommandCompletionMeta[] = [
  INSTALL_COMMAND_COMPLETION,
  GENERATE_COMMAND_COMPLETION,
  CLEANUP_COMMAND_COMPLETION,
  CHECK_UPDATES_COMMAND_COMPLETION,
  UPDATE_COMMAND_COMPLETION,
  DETECT_CONFLICTS_COMMAND_COMPLETION,
  LOG_COMMAND_COMPLETION,
  FILES_COMMAND_COMPLETION,
  DOCS_COMMAND_COMPLETION,
  FEATURES_COMMAND_COMPLETION,
];

/**
 * Formats a single option for zsh completion.
 */
function formatZshOption(option: ICompletionOption): string {
  const flag = option.flag;
  const description = option.description.replace(/'/g, "\\'");

  if (option.hasArg) {
    // Option with argument
    return `'${flag}=[${description}]:${option.argPlaceholder || 'arg'}:'`;
  }
  // Boolean flag
  return `'${flag}[${description}]'`;
}

/**
 * Formats command arguments specification for _arguments.
 */
function formatCommandArgs(globalOptions: ICompletionOption[]): string {
  const lines: string[] = [];

  // Add global options
  for (const option of globalOptions) {
    lines.push(formatZshOption(option));
  }

  // Add command selection
  lines.push("'1:command:->command'");
  lines.push("'*::arg:->args'");

  return lines.join(' \\\n');
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "\\'");
}

function formatToolNameList(toolNames: string[]): string {
  return toolNames.map((name) => escapeSingleQuotes(name)).join(' ');
}

function formatPositionalArgLine(
  description: string,
  positionalArgType: CompletionPositionalArgType | undefined,
  toolNames: string[]
): string {
  if (positionalArgType === 'tool' && toolNames.length > 0) {
    const toolList = formatToolNameList(toolNames);
    return `'1:${description}:(${toolList})'`;
  }
  return `'1:${description}:'`;
}

/**
 * Generates the commands case for the completion function.
 */
function generateCommandsCase(): string {
  return `_describe 'command' commands`;
}

/**
 * Removes trailing backslash from the last line if present.
 */
function removeTrailingBackslash(lines: string[]): void {
  if (lines.length === 0) return;
  const lastIndex = lines.length - 1;
  const lastLine = lines[lastIndex];
  if (lastLine?.endsWith(' \\')) {
    lines[lastIndex] = lastLine.slice(0, -2);
  }
}

/**
 * Collects all options for a command (command-specific + global).
 */
function collectCommandOptions(cmd: ICommandCompletionMeta, globalOptions: ICompletionOption[]): string[] {
  const allOptions: string[] = [];

  if (cmd.options) {
    for (const option of cmd.options) {
      allOptions.push(formatZshOption(option));
    }
  }

  for (const option of globalOptions) {
    allOptions.push(formatZshOption(option));
  }

  return allOptions;
}

/**
 * Generates subcommand completion lines.
 */
function generateSubcommandLines(subcommands: ICommandCompletionMeta[]): string[] {
  const lines: string[] = [];
  lines.push("'1:subcommand:->subcommand'");
  const subcommandDescriptions = subcommands
    .map((sub) => `'${sub.name}:${sub.description.replace(/'/g, "\\'")}'`)
    .join(' ');
  lines.push('case $state in');
  lines.push('  subcommand)');
  lines.push(`    local -a subcommands=(${subcommandDescriptions})`);
  lines.push("    _describe 'subcommand' subcommands");
  lines.push('    ;;');
  lines.push('esac');
  return lines;
}

/**
 * Generates case handler for a single command's arguments.
 */
function generateSingleCommandCase(
  cmd: ICommandCompletionMeta,
  globalOptions: ICompletionOption[],
  toolNames: string[]
): string {
  const caseLines: string[] = [];
  caseLines.push(`${cmd.name})`);

  const allOptions = collectCommandOptions(cmd, globalOptions);
  const hasContent = allOptions.length > 0 || cmd.hasPositionalArg || cmd.subcommands;

  if (hasContent) {
    caseLines.push('  _arguments \\');

    for (const opt of allOptions) {
      caseLines.push(`    ${opt} \\`);
    }

    if (cmd.subcommands && cmd.subcommands.length > 0) {
      const subLines = generateSubcommandLines(cmd.subcommands);
      for (const line of subLines) {
        caseLines.push(`    ${line}`);
      }
    } else if (cmd.hasPositionalArg) {
      const argDesc = cmd.positionalArgDescription || 'argument';
      const positionalLine = formatPositionalArgLine(argDesc, cmd.positionalArgType, toolNames);
      caseLines.push(`    ${positionalLine}`);
    } else {
      removeTrailingBackslash(caseLines);
    }
  }

  caseLines.push('  ;;');
  return caseLines.join('\n');
}

/**
 * Generates case handlers for each command's arguments.
 */
function generateArgsCases(
  commands: ICommandCompletionMeta[],
  globalOptions: ICompletionOption[],
  toolNames: string[]
): string {
  const cases: string[] = commands.map((cmd) => generateSingleCommandCase(cmd, globalOptions, toolNames));
  return cases.join('\n');
}

/**
 * Generates a native zsh completion script for the dotfiles CLI.
 *
 * @param binaryName - The name of the CLI binary (e.g., 'dotfiles')
 * @returns The complete zsh completion script content
 */
export function generateZshCompletion(binaryName: string, toolNames: string[]): string {
  const commands = ALL_COMMAND_COMPLETIONS;
  const globalOptions = GLOBAL_OPTIONS_COMPLETION.options || [];
  const sortedToolNames = [...toolNames].sort((a, b) => a.localeCompare(b));

  // Build the list of command descriptions for the initial command completion
  const commandDescriptions = commands.map((cmd) => `'${cmd.name}:${cmd.description.replace(/'/g, "\\'")}'`).join('\n');

  const script = dedentTemplate(
    `
    #compdef {binaryName}
    # Generated by Dotfiles Management Tool
    # Do not edit this file manually - it will be overwritten

    _{binaryName}() {
      local curcontext="$curcontext" state line
      typeset -A opt_args

      local -a commands=(
        {commandDescriptions}
      )

      _arguments -C \\
        {globalArgs}

      case $state in
        command)
          {commandsCase}
          ;;
        args)
          case $line[1] in
            {argsCases}
          esac
          ;;
      esac
    }

    _{binaryName} "$@"
    `,
    {
      binaryName,
      commandDescriptions,
      globalArgs: formatCommandArgs(globalOptions),
      commandsCase: generateCommandsCase(),
      argsCases: generateArgsCases(commands, globalOptions, sortedToolNames),
    }
  );

  return script;
}
