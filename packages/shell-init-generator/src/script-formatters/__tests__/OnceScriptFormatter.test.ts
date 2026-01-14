import type { ShellType } from '@dotfiles/core';
import { always, once } from '@dotfiles/core';
import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { OnceScriptFormatter } from '../OnceScriptFormatter';

import '@dotfiles/testing-helpers';

describe('OnceScriptFormatter', () => {
  const shellScriptsDir = '/test/shell-scripts';
  const homeDir = '/test/home';
  let formatter: OnceScriptFormatter;

  beforeEach(() => {
    formatter = new OnceScriptFormatter(shellScriptsDir, homeDir);
  });

  describe('bash shell', () => {
    it('should generate properly formatted once script with subshell wrapping and HOME override', () => {
      const script = once`
        echo "Setting up tool..."
        export TOOL_PATH="/usr/local/bin/tool"
        echo "Tool setup complete"
      `;

      const result = formatter.format(script, 'test-tool', 'bash', 0);

      expect(result.requiresExecution).toBe(true);
      expect(result.outputPath).toBe(path.join(shellScriptsDir, '.once', 'test-tool-0.bash'));
      expect(result.content).toMatchLooseInlineSnapshot`
        # Generated once script - will self-delete after execution
        (
          HOME="/test/home"
          echo "Setting up tool..."
          export TOOL_PATH="/usr/local/bin/tool"
          echo "Tool setup complete"
        )
        rm "/test/shell-scripts/.once/test-tool-0.bash"
      `;
    });

    it('should handle multi-line indented script content correctly', () => {
      const script = once`
        if [ -f ~/.bashrc ]; then
          echo "Found bashrc"
          source ~/.bashrc
        fi
        for file in ~/.config/*; do
          echo "Processing: $file"
        done
      `;

      const result = formatter.format(script, 'complex-tool', 'bash', 1);

      expect(result.content).toMatchLooseInlineSnapshot`
        # Generated once script - will self-delete after execution
        (
          HOME="/test/home"
          if [ -f ~/.bashrc ]; then
            echo "Found bashrc"
            source ~/.bashrc
          fi
          for file in ~/.config/*; do
            echo "Processing: $file"
          done
        )
        rm "/test/shell-scripts/.once/complex-tool-1.bash"
      `;
    });
  });

  describe('zsh shell', () => {
    it('should generate properly formatted once script with subshell wrapping and HOME override', () => {
      const script = once`
        echo "Setting up tool..."
        export TOOL_PATH="/usr/local/bin/tool"
        echo "Tool setup complete"
      `;

      const result = formatter.format(script, 'test-tool', 'zsh', 0);

      expect(result.requiresExecution).toBe(true);
      expect(result.outputPath).toBe(path.join(shellScriptsDir, '.once', 'test-tool-0.zsh'));
      expect(result.content).toMatchLooseInlineSnapshot`
        # Generated once script - will self-delete after execution
        (
          HOME="/test/home"
          echo "Setting up tool..."
          export TOOL_PATH="/usr/local/bin/tool"
          echo "Tool setup complete"
        )
        rm "/test/shell-scripts/.once/test-tool-0.zsh"
      `;
    });

    it('should handle multi-line indented script content correctly', () => {
      const script = once`
        if [ -f ~/.bashrc ]; then
          echo "Found bashrc"
          source ~/.bashrc
        fi
        for file in ~/.config/*; do
          echo "Processing: $file"
        done
      `;

      const result = formatter.format(script, 'complex-tool', 'zsh', 1);

      expect(result.content).toMatchLooseInlineSnapshot`
        # Generated once script - will self-delete after execution
        (
          HOME="/test/home"
          if [ -f ~/.bashrc ]; then
            echo "Found bashrc"
            source ~/.bashrc
          fi
          for file in ~/.config/*; do
            echo "Processing: $file"
          done
        )
        rm "/test/shell-scripts/.once/complex-tool-1.zsh"
      `;
    });
  });

  describe('powershell shell', () => {
    it('should generate properly formatted once script with HOME override and restoration', () => {
      const script = once`
        Write-Host "Setting up tool..."
        $env:TOOL_PATH = "/usr/local/bin/tool"
        Write-Host "Tool setup complete"
      `;

      const result = formatter.format(script, 'test-tool', 'powershell', 0);

      expect(result.requiresExecution).toBe(true);
      expect(result.outputPath).toBe(path.join(shellScriptsDir, '.once', 'test-tool-0.ps1'));
      expect(result.content).toMatchLooseInlineSnapshot`
        # Generated once script - will self-delete after execution
        $homeOrig = $env:HOME
        $userProfileOrig = $env:USERPROFILE
        try {
          $env:HOME = "/test/home"
          $env:USERPROFILE = "/test/home"
          Write-Host "Setting up tool..."
          $env:TOOL_PATH = "/usr/local/bin/tool"
          Write-Host "Tool setup complete"
        } finally {
          $env:HOME = $homeOrig
          $env:USERPROFILE = $userProfileOrig
          Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue
          Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue
        }
        Remove-Item "/test/shell-scripts/.once/test-tool-0.ps1"
      `;
    });

    it('should handle multi-line indented script content correctly', () => {
      const script = once`
        if (Test-Path ~/.bashrc) {
          Write-Host "Found bashrc"
          . ~/.bashrc
        }
        Get-ChildItem ~/.config/* | ForEach-Object {
          Write-Host "Processing: $_"
        }
      `;

      const result = formatter.format(script, 'complex-tool', 'powershell', 1);

      expect(result.content).toMatchLooseInlineSnapshot`
        # Generated once script - will self-delete after execution
        $homeOrig = $env:HOME
        $userProfileOrig = $env:USERPROFILE
        try {
          $env:HOME = "/test/home"
          $env:USERPROFILE = "/test/home"
          if (Test-Path ~/.bashrc) {
            Write-Host "Found bashrc"
            . ~/.bashrc
          }
          Get-ChildItem ~/.config/* | ForEach-Object {
            Write-Host "Processing: $_"
          }
        } finally {
          $env:HOME = $homeOrig
          $env:USERPROFILE = $userProfileOrig
          Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue
          Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue
        }
        Remove-Item "/test/shell-scripts/.once/complex-tool-1.ps1"
      `;
    });
  });

  describe('general functionality', () => {
    it('should generate unique output paths based on tool name and index', () => {
      const script = once`echo "test"`;

      const result1 = formatter.format(script, 'my-tool', 'bash', 0);
      const result2 = formatter.format(script, 'my-tool', 'bash', 1);
      const result3 = formatter.format(script, 'other-tool', 'bash', 0);

      expect(result1.outputPath).toBe(path.join(shellScriptsDir, '.once', 'my-tool-0.bash'));
      expect(result2.outputPath).toBe(path.join(shellScriptsDir, '.once', 'my-tool-1.bash'));
      expect(result3.outputPath).toBe(path.join(shellScriptsDir, '.once', 'other-tool-0.bash'));
    });

    it('should handle empty script content', () => {
      const script = once``;

      const result = formatter.format(script, 'empty-tool', 'bash');

      expect(result.content).toContain('(');
      expect(result.content).toContain(')');
      expect(result.content).toContain('rm');
      expect(result.requiresExecution).toBe(true);
    });

    it('should handle script content with special characters', () => {
      const script = once`
        echo "Path with spaces: /Program Files/Tool"
        echo 'Single quotes work too'
        echo "Quotes within \\"quotes\\""
        export VAR="value with $HOME variable"
      `;

      const result = formatter.format(script, 'special-chars', 'bash');

      const content = result.content;
      expect(content).toContain('echo "Path with spaces: /Program Files/Tool"');
      expect(content).toContain("echo 'Single quotes work too'");
      expect(content).toContain('echo "Quotes within \\\\"quotes\\\\""');
      expect(content).toContain('export VAR="value with $HOME variable"');
    });

    it('should throw error for non-once script types', () => {
      const alwaysScript = always`echo "test"`;

      expect(() => {
        formatter.format(alwaysScript, 'test-tool', 'bash');
      }).toThrow('OnceScriptFormatter can only format OnceScript, received: object');
    });

    it('should throw error for unsupported shell types', () => {
      const script = once`echo "test"`;

      expect(() => {
        formatter.format(script, 'test-tool', 'fish' as ShellType);
      }).toThrow('Unsupported shell type: fish');
    });
  });
});
