import { describe, expect, it } from 'bun:test';
import '../toMatchLooseInlineSnapshot';

describe('toMatchLooseInlineSnapshot', () => {
  describe('basic matching', () => {
    it('matches exact content', () => {
      expect('hello world').toMatchLooseInlineSnapshot`hello world`;
    });

    it('matches content anywhere in string', () => {
      expect('prefix hello world suffix').toMatchLooseInlineSnapshot`hello world`;
    });

    it('fails when content not found', () => {
      expect(() => {
        expect('hello world').toMatchLooseInlineSnapshot`goodbye world`;
      }).toThrow();
    });
  });

  describe('whitespace flexibility', () => {
    it('matches with different indentation levels', () => {
      const actual = `
  local -a commands=(
    'install:Install a tool'
    'generate:Generate files'
  )`;

      expect(actual).toMatchLooseInlineSnapshot`
        local -a commands=(
          'install:Install a tool'
          'generate:Generate files'
        )
      `;
    });

    it('matches content with leading whitespace in actual string', () => {
      const actual = '    indented content here';
      expect(actual).toMatchLooseInlineSnapshot`indented content here`;
    });

    it('normalizes multiple spaces to single whitespace match', () => {
      const actual = 'word1  word2   word3';
      expect(actual).toMatchLooseInlineSnapshot`word1 word2 word3`;
    });

    it('handles newlines as whitespace', () => {
      const actual = 'line1\nline2';
      expect(actual).toMatchLooseInlineSnapshot`line1 line2`;
    });
  });

  describe('with matchers', () => {
    it('supports expect.anything for wildcards', () => {
      expect('start middle end').toMatchLooseInlineSnapshot`start ${expect.anything} end`;
    });

    it('supports regex matchers', () => {
      expect('version 1.2.3').toMatchLooseInlineSnapshot`version ${/\d+\.\d+\.\d+/}`;
    });

    it('combines literal and matcher patterns', () => {
      const script = `#compdef dotfiles
_dotfiles() {
  local -a commands
}
_dotfiles "$@"`;

      expect(script).toMatchLooseInlineSnapshot`
        #compdef dotfiles
        _dotfiles() {
          ${expect.anything}
        }
        _dotfiles "$@"
      `;
    });
  });

  describe('multiline content', () => {
    it('matches multiline patterns in larger documents', () => {
      const document = `
Header section
Some preamble text

function example() {
  const x = 1;
  const y = 2;
  return x + y;
}

Footer section
`;

      expect(document).toMatchLooseInlineSnapshot`
        function example() {
          const x = 1;
          const y = 2;
          return x + y;
        }
      `;
    });
  });

  describe('special characters', () => {
    it('escapes regex special characters in literals', () => {
      expect('file.ts (test)').toMatchLooseInlineSnapshot`file.ts (test)`;
    });

    it('handles brackets and braces', () => {
      expect("const arr = ['a', 'b']").toMatchLooseInlineSnapshot`const arr = ['a', 'b']`;
    });

    it('handles shell variable syntax', () => {
      expect('case $state in').toMatchLooseInlineSnapshot`case $state in`;
    });
  });
});
