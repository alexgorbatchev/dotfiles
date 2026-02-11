import { describe, expect, it, mock } from 'bun:test';

/**
 * Test file for require-template-indent oxlint plugin rule.
 *
 * Since this is an oxlint JS plugin (ESLint-compatible), we test it by:
 * 1. Loading the plugin module
 * 2. Verifying the rule structure
 * 3. Simulating the rule behavior with mock AST nodes and source code
 */

// Load the plugin (ESM default export)
import plugin from '../plugin.js';

interface ASTVisitor {
  TemplateLiteral: (node: unknown) => void;
}

describe('require-template-indent plugin', () => {
  describe('plugin structure', () => {
    it('exports plugin with correct meta', () => {
      expect(plugin.meta).toEqual({
        name: 'dotfiles-testing',
        version: '1.0.0',
      });
    });

    it('exports require-template-indent rule', () => {
      expect(plugin.rules['require-template-indent']).toBeDefined();
    });
  });

  describe('rule meta', () => {
    const rule = plugin.rules['require-template-indent'];

    it('has correct meta type', () => {
      expect(rule.meta?.type).toBe('suggestion');
    });

    it('has description in docs', () => {
      expect(rule.meta?.docs?.description).toBe(
        'Require multiline template literals to be indented to match surrounding context',
      );
    });

    it('has message for badIndent', () => {
      expect(rule.meta?.messages?.['badIndent']).toBe(
        'Template content should be indented. Use dedentString() if indentation is significant.',
      );
    });
  });

  describe('rule.create()', () => {
    const rule = plugin.rules['require-template-indent'];

    it('returns visitor with TemplateLiteral handler', () => {
      const mockContext = {
        report: mock(() => {}),
        getSourceCode: () => ({ getLines: () => [] }),
      };
      const visitor = rule.create(mockContext) as ASTVisitor;

      expect(visitor.TemplateLiteral).toBeFunction();
    });

    describe('TemplateLiteral visitor', () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: ASTVisitor;

      /**
       * Creates a mock context with source code lines
       */
      function createMockContext(lines: string[]) {
        reportMock = mock(() => {});
        const mockContext = {
          report: reportMock,
          getSourceCode: () => ({
            getLines: () => lines,
          }),
        };
        visitor = rule.create(mockContext) as ASTVisitor;
      }

      it('reports template with content at column 0 when line is indented', () => {
        // Source:
        // Line 1:     const content = `
        // Line 2: export default ...
        // Line 3: `;
        createMockContext([
          '    const content = `',
          'export default (install) =>',
          '  install();',
          '`;',
        ]);

        // AST for template starting at line 1, with content not indented
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 20 } },
          quasis: [{ value: { raw: '\nexport default (install) =>\n  install();\n' } }],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: 'badIndent',
        });
      });

      it('does not report template with properly indented content', () => {
        // Source:
        // Line 1:     const content = `
        // Line 2:       export default ...
        // Line 3:     `;
        createMockContext([
          '    const content = `',
          '      export default (install) =>',
          '        install();',
          '    `;',
        ]);

        // AST for template starting at line 1, with content properly indented
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 20 } },
          quasis: [
            { value: { raw: '\n      export default (install) =>\n        install();\n    ' } },
          ],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report single-line template', () => {
        // Source: const msg = `hello world`;
        createMockContext(['    const msg = `hello world`;']);

        // AST for single-line template (no leading newline)
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 16 } },
          quasis: [{ value: { raw: 'hello world' } }],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report template with only whitespace content', () => {
        // Source: const empty = `\n\n`;
        createMockContext(['    const empty = `', '', '`;']);

        // AST for template with only newlines
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 18 } },
          quasis: [{ value: { raw: '\n\n' } }],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('reports template with partial indentation that is still less than context', () => {
        // Source:
        // Line 1:         const content = `
        // Line 2:   some content  (only 2 spaces, but context has 8)
        // Line 3:         `;
        createMockContext(['        const content = `', '  some content', '        `;']);

        // AST for template with some indent (2 spaces) but less than line indent (8 spaces)
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 24 } },
          quasis: [{ value: { raw: '\n  some content\n        ' } }],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: 'badIndent',
        });
      });

      it('does not report template at column 0 with content at column 0', () => {
        // Source:
        // Line 1: const content = `
        // Line 2: export default ...
        // Line 3: `;
        createMockContext(['const content = `', 'export default (install) =>', '`;']);

        // AST for template at column 0 with content also at column 0
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 16 } },
          quasis: [{ value: { raw: '\nexport default (install) =>\n' } }],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('handles templates with interpolations', () => {
        // Source:
        // Line 1:     const content = `
        // Line 2: export ${name}
        // Line 3: `;
        createMockContext(['    const content = `', 'export ${name}', '`;']);

        // AST for template with interpolation, content not indented
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 20 } },
          quasis: [{ value: { raw: '\nexport ' } }, { value: { raw: '\n' } }],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: 'badIndent',
        });
      });

      it('does not report template with missing location info', () => {
        createMockContext(['    const content = `', 'test', '`;']);

        // AST without loc
        const node = {
          type: 'TemplateLiteral',
          quasis: [{ value: { raw: '\ntest\n' } }],
        };

        visitor.TemplateLiteral(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('handles mixed empty and non-empty lines correctly', () => {
        // Source:
        // Line 1:     const content = `
        // Line 2:
        // Line 3: content
        // Line 4:
        // Line 5:     `;
        createMockContext(['    const content = `', '', 'content', '', '    `;']);

        // Empty lines should be ignored when calculating min indent
        const node = {
          type: 'TemplateLiteral',
          loc: { start: { line: 1, column: 20 } },
          quasis: [{ value: { raw: '\n\ncontent\n\n    ' } }],
        };

        visitor.TemplateLiteral(node);

        // Content line has 0 indent but context has 4 spaces
        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: 'badIndent',
        });
      });
    });
  });
});
