import { beforeEach, describe, expect, it, mock } from 'bun:test';

/**
 * Test file for no-throw-in-tests oxlint plugin rule.
 *
 * Since this is an oxlint JS plugin (ESLint-compatible), we test it by:
 * 1. Loading the plugin module
 * 2. Verifying the rule structure
 * 3. Simulating the rule behavior with mock AST nodes
 */

// Load the plugin (ESM default export)
import plugin from '../plugin.js';

interface ASTVisitor {
  ThrowStatement: (node: unknown) => void;
}

describe('no-throw-in-tests plugin', () => {
  describe('plugin structure', () => {
    it('exports no-throw-in-tests rule', () => {
      expect(plugin.rules['no-throw-in-tests']).toBeDefined();
    });
  });

  describe('rule meta', () => {
    const rule = plugin.rules['no-throw-in-tests'];

    it('has correct meta type', () => {
      expect(rule.meta?.type).toBe('problem');
    });

    it('has description in docs', () => {
      expect(rule.meta?.docs?.description).toBe('Disallow throw new Error in test files');
    });

    it('has message for violation', () => {
      expect(rule.meta?.messages?.['noThrowNewError']).toBe(
        "Don't use 'throw new Error' in tests. Use 'assert()' from 'node:assert' to fail with a condition.",
      );
    });
  });

  describe('rule.create()', () => {
    const rule = plugin.rules['no-throw-in-tests'];

    it('returns visitor with ThrowStatement handler', () => {
      const mockContext = { report: mock(() => {}) };
      const visitor = rule.create(mockContext) as ASTVisitor;

      expect(visitor.ThrowStatement).toBeFunction();
    });

    describe('ThrowStatement visitor', () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: ASTVisitor;

      beforeEach(() => {
        reportMock = mock(() => {});
        visitor = rule.create({ report: reportMock }) as ASTVisitor;
      });

      it('reports throw new Error()', () => {
        // AST for: throw new Error('message')
        const node = {
          type: 'ThrowStatement',
          argument: {
            type: 'NewExpression',
            callee: { type: 'Identifier', name: 'Error' },
            arguments: [{ type: 'Literal', value: 'message' }],
          },
        };

        visitor.ThrowStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: 'noThrowNewError',
        });
      });

      it('reports throw new Error() with no arguments', () => {
        // AST for: throw new Error()
        const node = {
          type: 'ThrowStatement',
          argument: {
            type: 'NewExpression',
            callee: { type: 'Identifier', name: 'Error' },
            arguments: [],
          },
        };

        visitor.ThrowStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: 'noThrowNewError',
        });
      });

      it('does not report throw with non-Error constructors', () => {
        // AST for: throw new CustomError('message')
        const node = {
          type: 'ThrowStatement',
          argument: {
            type: 'NewExpression',
            callee: { type: 'Identifier', name: 'CustomError' },
            arguments: [{ type: 'Literal', value: 'message' }],
          },
        };

        visitor.ThrowStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(0);
      });

      it('does not report throw with identifier (re-throwing)', () => {
        // AST for: throw error
        const node = {
          type: 'ThrowStatement',
          argument: { type: 'Identifier', name: 'error' },
        };

        visitor.ThrowStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(0);
      });

      it('does not report throw with literal', () => {
        // AST for: throw 'error message'
        const node = {
          type: 'ThrowStatement',
          argument: { type: 'Literal', value: 'error message' },
        };

        visitor.ThrowStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(0);
      });
    });
  });
});
