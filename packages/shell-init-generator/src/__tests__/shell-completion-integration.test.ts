import { describe, expect, test } from 'bun:test';
import type { ShellCompletionConfig } from '@dotfiles/core';
import { BashStringProducer } from '../shell-generators/BashStringProducer';
import { PowerShellStringProducer } from '../shell-generators/PowerShellStringProducer';
import { ZshStringProducer } from '../shell-generators/ZshStringProducer';

const mockConfig = {
  paths: {
    shellScriptsDir: '/home/user/.dotfiles/.generated/shell-scripts',
  },
  // biome-ignore lint/suspicious/noExplicitAny: Mock config for testing
} as any;

describe('Shell String Producers - Completion Handling', () => {
  describe('ZshStringProducer', () => {
    const producer = new ZshStringProducer(mockConfig);

    test('should handle command-based completions', () => {
      const completions: ShellCompletionConfig = {
        cmd: 'kubectl completion zsh',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('fpath=(');
      expect(result[0]).toContain('completions');
      expect(result[0]).toContain('$fpath)');
    });

    test('should handle source-based completions', () => {
      const completions: ShellCompletionConfig = {
        source: 'completions/_kubectl',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('fpath=(');
      expect(result[0]).toContain('zsh');
      expect(result[0]).toContain('completions');
    });

    test('should use custom target directory', () => {
      const completions: ShellCompletionConfig = {
        cmd: 'kubectl completion zsh',
        targetDir: '/custom/completions',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result[0]).toContain('"/custom/completions"');
    });
  });

  describe('BashStringProducer', () => {
    const producer = new BashStringProducer(mockConfig);

    test('should handle command-based completions', () => {
      const completions: ShellCompletionConfig = {
        cmd: 'kubectl completion bash',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('[[ -f ');
      expect(result[0]).toContain(']] && source ');
      expect(result[0]).toContain('completions');
      expect(result[0]).toContain('kubectl.bash');
    });

    test('should handle source-based completions', () => {
      const completions: ShellCompletionConfig = {
        source: 'completions/kubectl.bash',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('[[ -f ');
      expect(result[0]).toContain(']] && source ');
      expect(result[0]).not.toContain('completions/completions');
    });

    test('should use custom name', () => {
      const completions: ShellCompletionConfig = {
        cmd: 'kubectl completion bash',
        name: 'custom-kubectl',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result[0]).toContain('custom-kubectl');
      expect(result[0]).not.toContain('kubectl.bash');
    });
  });

  describe('PowerShellStringProducer', () => {
    const producer = new PowerShellStringProducer(mockConfig);

    test('should handle command-based completions', () => {
      const completions: ShellCompletionConfig = {
        cmd: 'kubectl completion powershell',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('if (Test-Path ');
      expect(result[0]).toContain(') { . ');
      expect(result[0]).toContain('completions');
      expect(result[0]).toContain('kubectl.ps1');
    });

    test('should handle source-based completions', () => {
      const completions: ShellCompletionConfig = {
        source: 'completions/kubectl.ps1',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('if (Test-Path ');
      expect(result[0]).toContain(') { . ');
      expect(result[0]).not.toContain('completions/completions');
    });

    test('should use custom target directory', () => {
      const completions: ShellCompletionConfig = {
        cmd: 'kubectl completion powershell',
        targetDir: '/custom/completions',
      };

      const result = producer.processCompletions('kubectl', completions);

      expect(result[0]).toContain('/custom/completions');
    });
  });

  describe('All Producers - Edge Cases', () => {
    test('should handle empty completions config', () => {
      const zshProducer = new ZshStringProducer(mockConfig);
      const bashProducer = new BashStringProducer(mockConfig);
      const psProducer = new PowerShellStringProducer(mockConfig);

      const completions: ShellCompletionConfig = {};

      expect(zshProducer.processCompletions('test', completions)).toEqual([]);
      expect(bashProducer.processCompletions('test', completions)).toEqual([]);
      expect(psProducer.processCompletions('test', completions)).toEqual([]);
    });
  });
});
