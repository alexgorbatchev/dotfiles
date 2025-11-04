/**
 * WORKING EXAMPLES: Install-First API with Perfect Type Safety
 *
 * This demonstrates the working type-safe patterns using generics with mapped types.
 * The error examples are in the tsd test files.
 */

import { defineTool } from '@dotfiles/cli';

// ============================================================================
// ✅ WORKING EXAMPLES
// ============================================================================

// Example 1: GitHub Release with all required fields
export const ripgrep = defineTool((install) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
    assetPattern: '*.tar.gz',
    version: '14.0.0',
  })
    .bin('rg')
    .version('14.0.0')
);

// Example 2: Homebrew installer
export const wget = defineTool((install) =>
  install('brew', {
    formula: 'wget',
  })
    .bin('wget')
    .version('latest')
);

// Example 3: Cargo installer
export const eza = defineTool((install) =>
  install('cargo', {
    crateName: 'eza',
  }).bin('eza')
);

// Example 4: Curl Script installer
export const rustup = defineTool((install) =>
  install('curl-script', {
    url: 'https://sh.rustup.rs',
    shell: 'sh',
  }).bin('rustup')
);

// Example 5: Curl Tar installer
export const node = defineTool((install) =>
  install('curl-tar', {
    url: 'https://nodejs.org/dist/v20.0.0/node-v20.0.0-darwin-arm64.tar.gz',
  })
    .bin('node')
    .bin('npm')
);

// Example 6: Manual installer (no automatic installation)
export const manualTool = defineTool((install) =>
  install('manual', {
    binaryPath: './bin/tool',
  }).bin('tool')
);

// Example 7: Manual with no params
export const existingTool = defineTool((install) => install().bin('existing-binary'));

// Example 8: Complex configuration with shell integration
export const bat = defineTool((install) =>
  install('github-release', {
    repo: 'sharkdp/bat',
    assetPattern: '*-x86_64-unknown-linux-gnu.tar.gz',
  })
    .bin('bat')
    .version('0.24.0')
    .zsh({
      environment: {
        BAT_THEME: 'ansi',
      },
      aliases: {
        cat: 'bat',
      },
      completions: {
        source: 'bat.zsh',
        name: '_bat',
      },
    })
);
