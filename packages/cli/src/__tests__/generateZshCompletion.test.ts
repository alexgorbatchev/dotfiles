import { describe, expect, it } from 'bun:test';
import { CHECK_UPDATES_COMMAND_COMPLETION } from '../checkUpdatesCommand';
import { CLEANUP_COMMAND_COMPLETION } from '../cleanupCommand';
import { GLOBAL_OPTIONS_COMPLETION } from '../createProgram';
import { DETECT_CONFLICTS_COMMAND_COMPLETION } from '../detectConflictsCommand';
import { DOCS_COMMAND_COMPLETION } from '../docsCommand';
import { FEATURES_COMMAND_COMPLETION } from '../featuresCommand';
import { FILES_COMMAND_COMPLETION } from '../filesCommand';
import { GENERATE_COMMAND_COMPLETION } from '../generateCommand';
import { ALL_COMMAND_COMPLETIONS, generateZshCompletion } from '../generateZshCompletion';
import { INSTALL_COMMAND_COMPLETION } from '../installCommand';
import { LOG_COMMAND_COMPLETION } from '../logCommand';
import { UPDATE_COMMAND_COMPLETION } from '../updateCommand';

const EMPTY_TOOL_NAMES: string[] = [];
const SAMPLE_TOOL_NAMES: string[] = ['dotbot', 'fzf'];

describe('generateZshCompletion', () => {
  describe('ALL_COMMAND_COMPLETIONS', () => {
    it('should include all command completion definitions', () => {
      expect(ALL_COMMAND_COMPLETIONS).toContain(INSTALL_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(GENERATE_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(CLEANUP_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(CHECK_UPDATES_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(UPDATE_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(DETECT_CONFLICTS_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(LOG_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(FILES_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(DOCS_COMMAND_COMPLETION);
      expect(ALL_COMMAND_COMPLETIONS).toContain(FEATURES_COMMAND_COMPLETION);
    });

    it('should have exactly 10 commands', () => {
      expect(ALL_COMMAND_COMPLETIONS.length).toBe(10);
    });
  });

  describe('GLOBAL_OPTIONS_COMPLETION', () => {
    it('should have global options defined', () => {
      expect(GLOBAL_OPTIONS_COMPLETION.options).toBeDefined();
      expect(GLOBAL_OPTIONS_COMPLETION.options!.length).toBeGreaterThan(0);
    });

    it('should include common options', () => {
      const flags = GLOBAL_OPTIONS_COMPLETION.options!.map((opt) => opt.flag);
      expect(flags).toContain('--config');
      expect(flags).toContain('--dry-run');
      expect(flags).toContain('--log');
      expect(flags).toContain('--verbose');
      expect(flags).toContain('--quiet');
      expect(flags).toContain('--platform');
      expect(flags).toContain('--arch');
    });
  });

  describe('generateZshCompletion', () => {
    it('should generate a valid zsh completion script', () => {
      const script = generateZshCompletion('dotfiles', EMPTY_TOOL_NAMES);

      expect(script).toContain('#compdef dotfiles');
      expect(script).toContain('_dotfiles()');
      expect(script).toContain('_dotfiles "$@"');
    });

    it('should include all command names in the script', () => {
      const script = generateZshCompletion('dotfiles', EMPTY_TOOL_NAMES);

      expect(script).toContain("'install:");
      expect(script).toContain("'generate:");
      expect(script).toContain("'cleanup:");
      expect(script).toContain("'check-updates:");
      expect(script).toContain("'update:");
      expect(script).toContain("'detect-conflicts:");
      expect(script).toContain("'log:");
      expect(script).toContain("'files:");
      expect(script).toContain("'docs:");
      expect(script).toContain("'features:");
    });

    it('should include global options in the script', () => {
      const script = generateZshCompletion('dotfiles', EMPTY_TOOL_NAMES);

      expect(script).toContain('--config');
      expect(script).toContain('--dry-run');
      expect(script).toContain('--log');
      expect(script).toContain('--verbose');
      expect(script).toContain('--quiet');
    });

    it('should include command-specific options', () => {
      const script = generateZshCompletion('dotfiles', EMPTY_TOOL_NAMES);

      // Install command options
      expect(script).toContain('--force');
      expect(script).toContain('--shim-mode');

      // Cleanup command options
      expect(script).toContain('--all');

      // Generate command options
      expect(script).toContain('--overwrite');
    });

    it('should handle subcommands for features command', () => {
      const script = generateZshCompletion('dotfiles', EMPTY_TOOL_NAMES);

      expect(script).toContain('features)');
      expect(script).toContain('subcommand');
      expect(script).toContain('catalog');
    });

    it('should include tool names for commands that accept tool arguments', () => {
      const script = generateZshCompletion('dotfiles', SAMPLE_TOOL_NAMES);

      expect(script).toContain("'1:tool name or binary name to install:(dotbot fzf)'");
      expect(script).toContain("'1:tool name (optional, checks all if omitted):(dotbot fzf)'");
      expect(script).toContain("'1:tool name to update:(dotbot fzf)'");
      expect(script).toContain("'1:tool name (optional):(dotbot fzf)'");
    });

    it('should use custom binary name', () => {
      const script = generateZshCompletion('my-cli', EMPTY_TOOL_NAMES);

      expect(script).toContain('#compdef my-cli');
      expect(script).toContain('_my-cli()');
      expect(script).toContain('_my-cli "$@"');
    });
  });

  describe('command completion metadata', () => {
    it('install command should have correct metadata', () => {
      expect(INSTALL_COMMAND_COMPLETION.name).toBe('install');
      expect(INSTALL_COMMAND_COMPLETION.hasPositionalArg).toBe(true);
      expect(INSTALL_COMMAND_COMPLETION.options).toBeDefined();
      expect(INSTALL_COMMAND_COMPLETION.options!.some((o) => o.flag === '--force')).toBe(true);
    });

    it('generate command should have correct metadata', () => {
      expect(GENERATE_COMMAND_COMPLETION.name).toBe('generate');
      expect(GENERATE_COMMAND_COMPLETION.options).toBeDefined();
      expect(GENERATE_COMMAND_COMPLETION.options!.some((o) => o.flag === '--overwrite')).toBe(true);
    });

    it('features command should have subcommands', () => {
      expect(FEATURES_COMMAND_COMPLETION.name).toBe('features');
      expect(FEATURES_COMMAND_COMPLETION.subcommands).toBeDefined();
      expect(FEATURES_COMMAND_COMPLETION.subcommands!.length).toBeGreaterThan(0);
      expect(FEATURES_COMMAND_COMPLETION.subcommands!.some((s) => s.name === 'catalog')).toBe(true);
    });

    it('cleanup command should have tool and type options with arguments', () => {
      expect(CLEANUP_COMMAND_COMPLETION.options).toBeDefined();
      const toolOption = CLEANUP_COMMAND_COMPLETION.options!.find((o) => o.flag === '--tool');
      expect(toolOption).toBeDefined();
      expect(toolOption!.hasArg).toBe(true);
      expect(toolOption!.argPlaceholder).toBe('<name>');
    });
  });
});
