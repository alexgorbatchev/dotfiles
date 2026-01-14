import { Architecture, defineTool, Platform } from '@dotfiles/cli';
import { describe, expect, it } from 'bun:test';

/**
 * Defines test scenarios for type safety of the defineTool API.
 *
 * These tests verify that:
 * - Valid configurations compile correctly
 * - Invalid configurations produce compile-time errors
 * - Type annotations are enforced for installer-specific parameters
 * - Platform-specific configurations are type-safe
 */
export function typeSafetyScenarios(): void {
  describe('type safety', () => {
    describe('valid configurations', () => {
      it('GitHub Release with all required fields compiles', () => {
        defineTool((install) =>
          install('github-release', {
            repo: 'BurntSushi/ripgrep',
            assetPattern: '*.tar.gz',
            version: '14.0.0',
          })
            .bin('rg')
            .version('14.0.0')
        );

        expect(true).toBe(true);
      });

      it('Homebrew installer compiles', () => {
        defineTool((install) =>
          install('brew', {
            formula: 'wget',
          })
            .bin('wget')
            .version('latest')
        );

        expect(true).toBe(true);
      });

      it('Cargo installer compiles', () => {
        defineTool((install) =>
          install('cargo', {
            crateName: 'eza',
          }).bin('eza')
        );

        expect(true).toBe(true);
      });

      it('Curl Script installer compiles', () => {
        defineTool((install) =>
          install('curl-script', {
            url: 'https://sh.rustup.rs',
            shell: 'sh',
          }).bin('rustup')
        );

        expect(true).toBe(true);
      });

      it('Curl Tar installer compiles', () => {
        defineTool((install) =>
          install('curl-tar', {
            url: 'https://nodejs.org/dist/v20.0.0/node-v20.0.0-darwin-arm64.tar.gz',
          })
            .bin('node')
            .bin('npm')
        );

        expect(true).toBe(true);
      });

      it('Manual installer compiles', () => {
        defineTool((install) =>
          install('manual', {
            binaryPath: './bin/tool',
          }).bin('tool')
        );

        expect(true).toBe(true);
      });

      it('Manual with no params compiles', () => {
        defineTool((install) => install().bin('existing-binary'));

        expect(true).toBe(true);
      });

      it('Complex configuration with shell integration compiles', () => {
        defineTool((install) =>
          install('github-release', {
            repo: 'sharkdp/bat',
            assetPattern: '*-x86_64-unknown-linux-gnu.tar.gz',
          })
            .bin('bat')
            .version('0.24.0')
            .zsh((shell) =>
              shell
                .environment({
                  BAT_THEME: 'ansi',
                })
                .aliases({
                  cat: 'bat',
                })
                .completions({
                  source: 'bat.zsh',
                  name: '_bat',
                })
            )
        );

        expect(true).toBe(true);
      });

      it('Platform-specific configuration compiles', () => {
        defineTool((install) =>
          install()
            .bin('rg')
            .platform(Platform.MacOS, (install) => install('brew', { formula: 'ripgrep' }))
            .platform(Platform.Linux, (install) =>
              install('github-release', {
                repo: 'BurntSushi/ripgrep',
              }))
        );

        expect(true).toBe(true);
      });

      it('Platform with architecture compiles', () => {
        defineTool((install) =>
          install()
            .bin('tool')
            .platform(Platform.Linux, Architecture.X86_64, (install) =>
              install('github-release', {
                repo: 'owner/tool',
                assetPattern: '*linux-amd64*',
              }))
            .platform(Platform.Linux, Architecture.Arm64, (install) =>
              install('github-release', {
                repo: 'owner/tool',
                assetPattern: '*linux-arm64*',
              }))
        );

        expect(true).toBe(true);
      });
    });

    describe('compile-time errors', () => {
      it('missing required repo property should cause compile error', () => {
        defineTool((install) =>
          // @ts-expect-error - Missing required 'repo' property
          install('github-release', {
            assetPattern: '*.tar.gz',
          }).bin('tool')
        );

        expect(true).toBe(true);
      });

      it('invalid property name should cause compile error', () => {
        defineTool((install) =>
          install('github-release', {
            repo: 'owner/repo',
            // @ts-expect-error - Invalid property name
            invalidProperty: 'should-error',
          }).bin('tool')
        );

        expect(true).toBe(true);
      });

      it('wrong params for method should cause compile error', () => {
        defineTool((install) =>
          install('brew', {
            // @ts-expect-error - Wrong params for brew method
            repo: 'something',
          }).bin('tool')
        );

        expect(true).toBe(true);
      });

      it('invalid method name should cause compile error', () => {
        defineTool((install) =>
          // @ts-expect-error - Invalid installation method
          install('npm', {
            package: 'something',
          }).bin('tool')
        );

        expect(true).toBe(true);
      });

      it('wrong type for property should cause compile error', () => {
        defineTool((install) =>
          install('github-release', {
            repo: 'owner/repo',
            // @ts-expect-error - Wrong type for version property
            version: 123,
          }).bin('tool')
        );

        expect(true).toBe(true);
      });

      it('empty params for brew should compile (formula is optional)', () => {
        defineTool((install) => install('brew', {}).bin('tool'));

        expect(true).toBe(true);
      });

      it('missing required crateName for cargo should cause compile error', () => {
        // @ts-expect-error - Missing required 'crateName' property
        defineTool((install) => install('cargo', {}).bin('tool'));

        expect(true).toBe(true);
      });

      it('missing required url for curl-script should cause compile error', () => {
        defineTool((install) =>
          // @ts-expect-error - Missing required 'url' property
          install('curl-script', {
            shell: 'sh',
          }).bin('tool')
        );

        expect(true).toBe(true);
      });

      it('invalid shell type for curl-script should cause compile error', () => {
        defineTool((install) =>
          install('curl-script', {
            url: 'https://sh.rustup.rs',
            // @ts-expect-error - Invalid shell type
            shell: 'invalid-shell',
          }).bin('tool')
        );

        expect(true).toBe(true);
      });
    });
  });
}
