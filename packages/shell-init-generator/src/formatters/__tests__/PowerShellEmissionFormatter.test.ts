import {
  alias,
  completion,
  environment,
  fn,
  path,
  script,
  sourceFile,
  sourceFunction,
} from '@dotfiles/shell-emissions';
import { beforeEach, describe, expect, it } from 'bun:test';
import { PowerShellEmissionFormatter } from '../PowerShellEmissionFormatter';

// oxlint-disable-next-line import/no-unassigned-import
import '@dotfiles/testing-helpers';

describe('PowerShellEmissionFormatter', () => {
  const onceScriptDir = '/test/.once';
  let formatter: PowerShellEmissionFormatter;

  beforeEach(() => {
    formatter = new PowerShellEmissionFormatter({ onceScriptDir });
  });

  describe('formatEnvironment', () => {
    it('should format environment variable', () => {
      const emission = environment({ MY_VAR: 'my-value' });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"$env:MY_VAR = "my-value""`);
    });

    it('should format multiple environment variables', () => {
      const emission = environment({ VAR1: 'value1', VAR2: 'value2' });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "$env:VAR1 = "value1"
        $env:VAR2 = "value2""
      `);
    });
  });

  describe('formatAlias', () => {
    it('should format single alias', () => {
      const emission = alias({ ll: 'ls -la' });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"Set-Alias -Name ll -Value "ls -la""`);
    });
  });

  describe('formatFunction', () => {
    it('should format function', () => {
      const emission = fn('greet', 'Write-Host "Hello, $args[0]!"');
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`
        "function greet {
          Write-Host "Hello, $args[0]!"
        }"
      `);
    });
  });

  describe('formatScript', () => {
    it('should format always script', () => {
      const emission = script('Write-Host "hello"', 'always');
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"Write-Host "hello""`);
    });
  });

  describe('formatOnceScript', () => {
    it('should format once script with correct filename', () => {
      const emission = script('Write-Host "setup"', 'once');
      const result = formatter.formatOnceScript(emission, 1);

      expect(result.filename).toMatchInlineSnapshot(`"once-001.ps1"`);
      expect(result.content).toMatchInlineSnapshot(`
        "# Generated once script - will self-delete after execution
        Write-Host "setup"
        Remove-Item "/test/.once/once-001.ps1""
      `);
    });
  });

  describe('formatSourceFile', () => {
    it('should format source file', () => {
      const emission = sourceFile('$HOME/.toolrc');
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`". "$HOME/.toolrc""`);
    });
  });

  describe('formatSourceFunction', () => {
    it('should format source function', () => {
      const emission = sourceFunction('myFunc');
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"Invoke-Expression (& myFunc)"`);
    });
  });

  describe('formatCompletion', () => {
    it('should format completion with files', () => {
      const emission = completion({ files: ['/path/to/completion'] });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"if (Test-Path "/path/to/completion") { . "/path/to/completion" }"`);
    });
  });

  describe('formatPath', () => {
    it('should format path with deduplication', () => {
      const emission = path('/usr/local/bin', { position: 'prepend', deduplicate: true });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(
        `"if ($env:PATH -notlike "*/usr/local/bin*") { $env:PATH = "/usr/local/bin;$env:PATH" }"`,
      );
    });

    it('should format path without deduplication', () => {
      const emission = path('/usr/local/bin', { deduplicate: false });
      const result = formatter.formatEmission(emission);

      expect(result).toMatchInlineSnapshot(`"$env:PATH = "/usr/local/bin;$env:PATH""`);
    });
  });

  describe('formatOnceScriptInitializer', () => {
    it('should generate once script loop', () => {
      const result = formatter.formatOnceScriptInitializer();

      expect(result).toMatchInlineSnapshot(`
        "# Execute once scripts (runs only once per script)
        Get-ChildItem -Path "/test/.once/*.ps1" -ErrorAction SilentlyContinue | ForEach-Object {
          if (Test-Path $_.FullName) {
            & $_.FullName
          }
        }"
      `);
    });
  });

  describe('formatFileHeader', () => {
    it('should generate file header', () => {
      const result = formatter.formatFileHeader();

      expect(result).toMatchInlineSnapshot(`
        "# ==============================================================================
        # THIS FILE IS AUTOMATICALLY GENERATED BY THE DOTFILES MANAGEMENT TOOL
        # DO NOT EDIT THIS FILE DIRECTLY - YOUR CHANGES WILL BE OVERWRITTEN
        # ==============================================================================
        "
      `);
    });
  });

  describe('formatSectionHeader', () => {
    it('should generate section header', () => {
      const result = formatter.formatSectionHeader('PATH Modifications');

      expect(result).toMatchInlineSnapshot(
        `"# ============================= PATH Modifications =============================="`,
      );
    });
  });

  describe('formatFileFooter', () => {
    it('should generate file footer', () => {
      const result = formatter.formatFileFooter();

      expect(result).toMatchInlineSnapshot(
        `"# ============================ End of Generated File ============================"`,
      );
    });
  });
});
