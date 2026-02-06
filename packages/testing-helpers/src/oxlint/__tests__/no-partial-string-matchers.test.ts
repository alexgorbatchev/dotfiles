import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Rule } from 'eslint';

/**
 * Test file for no-partial-string-matchers oxlint plugin rule.
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
  CallExpression: (node: unknown) => void;
}

describe('no-partial-string-matchers plugin', () => {
  describe('plugin structure', () => {
    it('exports plugin with correct meta', () => {
      expect(plugin.meta).toEqual({
        name: 'dotfiles-testing',
        version: '1.0.0',
      });
    });

    it('exports no-partial-string-matchers rule', () => {
      expect(plugin.rules['no-partial-string-matchers']).toBeDefined();
    });
  });

  describe('rule meta', () => {
    const rule = plugin.rules['no-partial-string-matchers'];

    it('has correct meta type', () => {
      expect(rule.meta?.type).toBe('problem');
    });

    it('has description in docs', () => {
      expect(rule.meta?.docs?.description).toBe(
        'Disallow partial string matchers (toContain, toMatch) that can cause false positives',
      );
    });

    it('has messages for both matchers', () => {
      expect(rule.meta?.messages?.['noToContain']).toBeDefined();
      expect(rule.meta?.messages?.['noToMatch']).toBeDefined();
    });
  });

  describe('rule.create()', () => {
    const rule = plugin.rules['no-partial-string-matchers'];

    it('returns visitor with CallExpression handler', () => {
      const mockContext = { report: mock(() => {}) } as unknown as Rule.RuleContext;
      const visitor = rule.create(mockContext) as ASTVisitor;

      expect(visitor.CallExpression).toBeFunction();
    });

    describe('CallExpression visitor', () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: ASTVisitor;

      beforeEach(() => {
        reportMock = mock(() => {});
        visitor = rule.create({ report: reportMock } as unknown as Rule.RuleContext) as ASTVisitor;
      });

      it('reports toContain() on expect chain', () => {
        // AST for: expect(value).toContain('substring')
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toContain' },
          },
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: node.callee?.property,
          messageId: 'noToContain',
        });
      });

      it('reports toMatch() on expect chain', () => {
        // AST for: expect(value).toMatch(/pattern/)
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatch' },
          },
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: node.callee?.property,
          messageId: 'noToMatch',
        });
      });

      it('reports toContain() with .not modifier', () => {
        // AST for: expect(value).not.toContain('substring')
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
              },
              property: { type: 'Identifier', name: 'not' },
            },
            property: { type: 'Identifier', name: 'toContain' },
          },
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: node.callee?.property,
          messageId: 'noToContain',
        });
      });

      it('does not report toContainEqual()', () => {
        // AST for: expect(array).toContainEqual(item)
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toContainEqual' },
          },
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report toMatchObject()', () => {
        // AST for: expect(obj).toMatchObject(expected)
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchObject' },
          },
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report toMatchInlineSnapshot()', () => {
        // AST for: expect(value).toMatchInlineSnapshot()
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
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report toMatchSnapshot()', () => {
        // AST for: expect(value).toMatchSnapshot()
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toMatchSnapshot' },
          },
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report toEqual()', () => {
        // AST for: expect(value).toEqual(expected)
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'expect' },
            },
            property: { type: 'Identifier', name: 'toEqual' },
          },
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report toContain() not in expect chain', () => {
        // AST for: array.toContain('value') - not an expect call
        const node = {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              callee: { type: 'Identifier', name: 'array' },
            },
            property: { type: 'Identifier', name: 'toContain' },
          },
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
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
      });
    });
  });
});
