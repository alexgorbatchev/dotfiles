import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { ShellType } from '@types';
import { always, once } from '@types';
import { OnceScriptFormatter } from '../OnceScriptFormatter';

import '@testing-helpers/matchers';

describe('OnceScriptFormatter', () => {
  const shellScriptsDir = '/test/shell-scripts';
  let formatter: OnceScriptFormatter;

  beforeEach(() => {
    formatter = new OnceScriptFormatter(shellScriptsDir);
  });

  describe('bash shell', () => {
    it('should generate properly formatted once script with function wrapping', () => {
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
        __dotfiles_test-tool-0_once() {
          echo "Setting up tool..."
          export TOOL_PATH="/usr/local/bin/tool"
          echo "Tool setup complete"
        }
        __dotfiles_test-tool-0_once
        unset -f __dotfiles_test-tool-0_once
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
        __dotfiles_complex-tool-1_once() {
          if [ -f ~/.bashrc ]; then
            echo "Found bashrc"
            source ~/.bashrc
          fi
          
          for file in ~/.config/*; do
            echo "Processing: $file"
          done
        }
        __dotfiles_complex-tool-1_once
        unset -f __dotfiles_complex-tool-1_once
        rm "/test/shell-scripts/.once/complex-tool-1.bash"
      `;
    });
  });

  describe('zsh shell', () => {
    it('should generate properly formatted once script with function wrapping', () => {
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
        __dotfiles_test-tool-0_once() {
          echo "Setting up tool..."
          export TOOL_PATH="/usr/local/bin/tool"
          echo "Tool setup complete"
        }
        __dotfiles_test-tool-0_once
        unset -f __dotfiles_test-tool-0_once
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
        __dotfiles_complex-tool-1_once() {
          if [ -f ~/.bashrc ]; then
            echo "Found bashrc"
            source ~/.bashrc
          fi
          
          for file in ~/.config/*; do
            echo "Processing: $file"
          done
        }
        __dotfiles_complex-tool-1_once
        unset -f __dotfiles_complex-tool-1_once
        rm "/test/shell-scripts/.once/complex-tool-1.zsh"
      `;
    });
  });

  describe('powershell shell', () => {
    it('should generate properly formatted once script with function wrapping', () => {
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
        function __dotfiles_test-tool-0_once {
          Write-Host "Setting up tool..."
          $env:TOOL_PATH = "/usr/local/bin/tool"
          Write-Host "Tool setup complete"
        }
        __dotfiles_test-tool-0_once
        Remove-Item Function:__dotfiles_test-tool-0_once
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
        function __dotfiles_complex-tool-1_once {
          if (Test-Path ~/.bashrc) {
            Write-Host "Found bashrc"
            . ~/.bashrc
          }
          
          Get-ChildItem ~/.config/* | ForEach-Object {
            Write-Host "Processing: $_"
          }
        }
        __dotfiles_complex-tool-1_once
        Remove-Item Function:__dotfiles_complex-tool-1_once
        Remove-Item "/test/shell-scripts/.once/complex-tool-1.ps1"
      `;
    });
  });

  describe('general functionality', () => {
    it('should generate unique function names based on tool name and index', () => {
      const script = once`echo "test"`;

      const result1 = formatter.format(script, 'my-tool', 'bash', 0);
      const result2 = formatter.format(script, 'my-tool', 'bash', 1);
      const result3 = formatter.format(script, 'other-tool', 'bash', 0);

      expect(result1.content).toContain('__dotfiles_my-tool-0_once');
      expect(result2.content).toContain('__dotfiles_my-tool-1_once');
      expect(result3.content).toContain('__dotfiles_other-tool-0_once');

      expect(result1.outputPath).toBe(path.join(shellScriptsDir, '.once', 'my-tool-0.bash'));
      expect(result2.outputPath).toBe(path.join(shellScriptsDir, '.once', 'my-tool-1.bash'));
      expect(result3.outputPath).toBe(path.join(shellScriptsDir, '.once', 'other-tool-0.bash'));
    });

    it('should handle empty script content', () => {
      const script = once``;

      const result = formatter.format(script, 'empty-tool', 'bash');

      expect(result.content).toContain('__dotfiles_empty-tool-0_once');
      expect(result.content).toContain('unset -f');
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
