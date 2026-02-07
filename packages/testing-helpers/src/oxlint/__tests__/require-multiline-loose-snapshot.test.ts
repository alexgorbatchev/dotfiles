import { beforeEach, describe, expect, it, mock } from 'bun:test';

/**
 * Test file for require-multiline-loose-snapshot oxlint plugin rule.
 *
 * Since this is an oxlint JS plugin (ESLint-compatible), we test it by:
 * 1. Loading the plugin module
 * 2. Verifying the rule structure
 * 3. Simulating the rule behavior with mock AST nodes
 */

// Load the plugin (ESM default export)
import plugin from '../plugin.js';

interface ASTVisitor {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- mock AST visitor for testing
  TaggedTemplateExpression: (node: unknown) => void;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- mock AST visitor for testing
  CallExpression: (node: unknown) => void;
}

describe('require-multiline-loose-snapshot plugin', () => {
  describe('plugin structure', () => {
    it('exports plugin with correct meta', () => {
      expect(plugin.meta).toEqual({
        name: 'dotfiles-testing',
        version: '1.0.0',
      });
    });

    it('exports require-multiline-loose-snapshot rule', () => {
      expect(plugin.rules['require-multiline-loose-snapshot']).toBeDefined();
    });
  });

  describe('rule meta', () => {
    const rule = plugin.rules['require-multiline-loose-snapshot'];

    it('has correct meta type', () => {
      expect(rule.meta?.type).toBe('problem');
    });

    it('has description in docs', () => {
      expect(rule.meta?.docs?.description).toBe(
        'Require toMatchLooseInlineSnapshot to use multiline template literals for capturing context',
      );
    });

    it('has message for requireMultiline', () => {
      expect(rule.meta?.messages?.['requireMultiline']).toBeDefined();
    });
  });

  describe('rule.create()', () => {
    const rule = plugin.rules['require-multiline-loose-snapshot'];

    it('returns visitor with TaggedTemplateExpression and CallExpression handlers', () => {
      const mockContext = { report: mock(() => {}) };
      const visitor = rule.create(mockContext) as ASTVisitor;

      expect(visitor.TaggedTemplateExpression).toBeFunction();
      expect(visitor.CallExpression).toBeFunction();
    });

    describe('TaggedTemplateExpression visitor', () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: ASTVisitor;

      beforeEach(() => {
        reportMock = mock(() => {});
        visitor = rule.create({ report: reportMock }) as ASTVisitor;
      });

      it('reports single-line tagged template on expect chain', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot`single line`
        const propertyNode = { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' };
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: propertyNode,
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: 'single line content' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: propertyNode,
          messageId: 'requireMultiline',
        });
      });

      it('reports empty tagged template on expect chain', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot``
        const propertyNode = { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' };
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: propertyNode,
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: '' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: propertyNode,
          messageId: 'requireMultiline',
        });
      });

      it('does not report multiline tagged template on expect chain', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot`
        //   first line
        //   second line
        // `
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' },
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: '\n  first line\n  second line\n' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('reports tagged template with only one newline', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot`line1\nline2` (only 1 newline - not enough)
        const propertyNode = { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' };
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: propertyNode,
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: 'line1\nline2' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: propertyNode,
          messageId: 'requireMultiline',
        });
      });

      it('does not report tagged template with two or more newlines', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot`line1\nline2\nline3`
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' },
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: 'line1\nline2\nline3' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('reports single-line tagged template with .not modifier', () => {
        // AST for: expect(value).not.toMatchLooseInlineSnapshot`single line`
        const propertyNode = { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' };
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
              },
              property: { type: 'Identifier', name: 'not' },
            },
            property: propertyNode,
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: 'single line' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: propertyNode,
          messageId: 'requireMultiline',
        });
      });

      it('does not report toMatchLooseInlineSnapshot not in expect chain', () => {
        // AST for: someObj.toMatchLooseInlineSnapshot`text`
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'someObj',
            },
            property: { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' },
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: 'single line' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report other tagged templates', () => {
        // AST for: expect(value).toMatchInlineSnapshot`text`
        const node = {
          type: 'TaggedTemplateExpression',
          tag: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchInlineSnapshot' },
          },
          quasi: {
            type: 'TemplateLiteral',
            quasis: [{ value: { raw: 'single line' } }],
          },
        };

        visitor.TaggedTemplateExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });
    });

    describe('CallExpression visitor', () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: ASTVisitor;

      beforeEach(() => {
        reportMock = mock(() => {});
        visitor = rule.create({ report: reportMock }) as ASTVisitor;
      });

      it('reports single-line template literal argument', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot(`single line`)
        const propertyNode = { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' };
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: propertyNode,
          },
          arguments: [
            {
              type: 'TemplateLiteral',
              quasis: [{ value: { raw: 'single line' } }],
            },
          ],
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: propertyNode,
          messageId: 'requireMultiline',
        });
      });

      it('reports single-line string literal argument', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot('single line')
        const propertyNode = { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' };
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: propertyNode,
          },
          arguments: [{ type: 'Literal', value: 'single line' }],
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: propertyNode,
          messageId: 'requireMultiline',
        });
      });

      it('does not report multiline template literal argument', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot(`
        //   multiline
        // `)
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' },
          },
          arguments: [
            {
              type: 'TemplateLiteral',
              quasis: [{ value: { raw: '\n  multiline\n' } }],
            },
          ],
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report multiline string literal argument with enough lines', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot('line1\nline2\nline3')
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' },
          },
          arguments: [{ type: 'Literal', value: 'line1\nline2\nline3' }],
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('reports string literal argument with only one newline', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot('line1\nline2') - only 1 newline
        const propertyNode = { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' };
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: propertyNode,
          },
          arguments: [{ type: 'Literal', value: 'line1\nline2' }],
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: propertyNode,
          messageId: 'requireMultiline',
        });
      });

      it('does not report toMatchLooseInlineSnapshot not in expect chain', () => {
        // AST for: someObj.toMatchLooseInlineSnapshot(`text`)
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'someObj',
            },
            property: { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' },
          },
          arguments: [
            {
              type: 'TemplateLiteral',
              quasis: [{ value: { raw: 'single line' } }],
            },
          ],
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report other matchers', () => {
        // AST for: expect(value).toMatchInlineSnapshot(`text`)
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchInlineSnapshot' },
          },
          arguments: [
            {
              type: 'TemplateLiteral',
              quasis: [{ value: { raw: 'single line' } }],
            },
          ],
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report call without arguments', () => {
        // AST for: expect(value).toMatchLooseInlineSnapshot()
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchLooseInlineSnapshot' },
          },
          arguments: [],
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report non-MemberExpression callee', () => {
        // AST for: someFunction()
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: 'someFunction',
          },
          arguments: [],
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });
    });
  });
});
