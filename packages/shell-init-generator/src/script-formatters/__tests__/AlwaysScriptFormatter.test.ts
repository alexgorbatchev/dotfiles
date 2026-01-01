import { beforeEach, describe, expect, it } from 'bun:test';
import { always, once } from '@dotfiles/core';
import { AlwaysScriptFormatter } from '../AlwaysScriptFormatter';

import '@dotfiles/testing-helpers';

describe('AlwaysScriptFormatter', () => {
  let formatter: AlwaysScriptFormatter;

  beforeEach(() => {
    formatter = new AlwaysScriptFormatter();
  });

  describe('bash shell', () => {
    it('should generate properly formatted always script with subshell wrapping', () => {
      const script = always`
        echo "Setting up tool..."
        export TOOL_PATH="/usr/local/bin/tool"
        echo "Tool setup complete"
      `;

      const result = formatter.format(script, 'test-tool', 'bash');

      expect(result.requiresExecution).toBe(false);
      expect(result.content).toMatchLooseInlineSnapshot`
        (
          echo "Setting up tool..."
          export TOOL_PATH="/usr/local/bin/tool"
          echo "Tool setup complete"
        )
      `;
    });

    it('should handle multi-line indented script content correctly', () => {
      const script = always`
        if [ -f ~/.bashrc ]; then
          echo "Found bashrc"
          source ~/.bashrc
        fi
        
        for file in ~/.config/*; do
          echo "Processing: $file"
        done
      `;

      const result = formatter.format(script, 'complex-tool', 'bash');

      expect(result.content).toMatchLooseInlineSnapshot`
        (
          if [ -f ~/.bashrc ]; then
            echo "Found bashrc"
            source ~/.bashrc
          fi
          
          for file in ~/.config/*; do
            echo "Processing: $file"
          done
        )
      `;
    });
  });

  describe('zsh shell', () => {
    it('should generate properly formatted always script with subshell wrapping', () => {
      const script = always`
        echo "Setting up tool..."
        export TOOL_PATH="/usr/local/bin/tool"
        echo "Tool setup complete"
      `;

      const result = formatter.format(script, 'test-tool', 'zsh');

      expect(result.requiresExecution).toBe(false);
      expect(result.content).toMatchLooseInlineSnapshot`
        (
          echo "Setting up tool..."
          export TOOL_PATH="/usr/local/bin/tool"
          echo "Tool setup complete"
        )
      `;
    });

    it('should handle multi-line indented script content correctly', () => {
      const script = always`
        if [ -f ~/.zshrc ]; then
          echo "Found zshrc"
          source ~/.zshrc
        fi
        
        for file in ~/.config/*; do
          echo "Processing: $file"
        done
      `;

      const result = formatter.format(script, 'complex-tool', 'zsh');

      expect(result.content).toMatchLooseInlineSnapshot`
        (
          if [ -f ~/.zshrc ]; then
            echo "Found zshrc"
            source ~/.zshrc
          fi
          
          for file in ~/.config/*; do
            echo "Processing: $file"
          done
        )
      `;
    });
  });

  describe('powershell shell', () => {
    it('should generate properly formatted always script with try-finally wrapping', () => {
      const script = always`
        Write-Host "Setting up tool..."
        $env:TOOL_PATH = "/usr/local/bin/tool"
        Write-Host "Tool setup complete"
      `;

      const result = formatter.format(script, 'test-tool', 'powershell');

      expect(result.requiresExecution).toBe(false);
      expect(result.content).toMatchLooseInlineSnapshot`
        try {
          Write-Host "Setting up tool..."
          $env:TOOL_PATH = "/usr/local/bin/tool"
          Write-Host "Tool setup complete"
        } finally {}
      `;
    });

    it('should handle multi-line indented script content correctly', () => {
      const script = always`
        if (Test-Path ~/.bashrc) {
          Write-Host "Found bashrc"
          . ~/.bashrc
        }
        
        Get-ChildItem ~/.config/* | ForEach-Object {
          Write-Host "Processing: $_"
        }
      `;

      const result = formatter.format(script, 'complex-tool', 'powershell');

      expect(result.content).toMatchLooseInlineSnapshot`
        try {
          if (Test-Path ~/.bashrc) {
            Write-Host "Found bashrc"
            . ~/.bashrc
          }
          
          Get-ChildItem ~/.config/* | ForEach-Object {
            Write-Host "Processing: $_"
          }
        } finally {}
      `;
    });
  });

  describe('error handling', () => {
    it('should throw error for non-always script', () => {
      const script = once`echo "test"`;

      expect(() => formatter.format(script, 'test-tool', 'zsh')).toThrow(
        'AlwaysScriptFormatter can only format AlwaysScript'
      );
    });

    it('should throw error for unsupported shell type', () => {
      const script = always`echo "test"`;

      expect(() => formatter.format(script, 'test-tool', 'fish' as 'zsh')).toThrow('Unsupported shell type: fish');
    });
  });
});
