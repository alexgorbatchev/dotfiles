import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Test file for no-conditional-logic oxlint plugin rule.
 *
 * Since this is an oxlint JS plugin (ESLint-compatible), we test it by:
 * 1. Loading the plugin module
 * 2. Verifying the rule structure
 * 3. Simulating the rule behavior with mock AST nodes
 */

// Load the plugin (ESM default export)
import plugin from "../plugin.js";

interface IAstVisitor {
  CallExpression: (node: unknown) => void;
  "CallExpression:exit": (node: unknown) => void;
  IfStatement: (node: unknown) => void;
}

describe("no-conditional-logic plugin", () => {
  describe("plugin structure", () => {
    it("exports plugin with correct meta", () => {
      expect(plugin.meta).toEqual({
        name: "dotfiles-testing",
        version: "1.0.0",
      });
    });

    it("exports no-conditional-logic rule", () => {
      expect(plugin.rules["no-conditional-logic"]).toBeDefined();
    });
  });

  describe("rule meta", () => {
    const rule = plugin.rules["no-conditional-logic"];

    it("has correct meta type", () => {
      expect(rule.meta?.type).toBe("problem");
    });

    it("has description in docs", () => {
      expect(rule.meta?.docs?.description).toBe("Disallow if statements in test files");
    });

    it("has message for violation", () => {
      expect(rule.meta?.messages?.["noIfStatement"]).toBe(
        "Don't use 'if' statements in tests. Use 'assert()' from 'node:assert' for type narrowing and conditional assertions.",
      );
    });
  });

  describe("rule.create()", () => {
    const rule = plugin.rules["no-conditional-logic"];

    it("returns visitor with IfStatement and CallExpression handlers", () => {
      const mockContext = { report: mock(() => {}) };
      const visitor = rule.create(mockContext) as IAstVisitor;

      expect(visitor.IfStatement).toBeFunction();
      expect(visitor.CallExpression).toBeFunction();
      expect(visitor["CallExpression:exit"]).toBeFunction();
    });

    describe("IfStatement visitor", () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: IAstVisitor;

      beforeEach(() => {
        reportMock = mock(() => {});
        visitor = rule.create({
          report: reportMock,
        }) as IAstVisitor;
      });

      it("reports simple if statement", () => {
        // AST for: if (condition) { ... }
        const node = {
          type: "IfStatement",
          test: { type: "Identifier", name: "condition" },
          consequent: { type: "BlockStatement", body: [] },
        };

        visitor.IfStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: "noIfStatement",
        });
      });

      it("reports if-else statement", () => {
        // AST for: if (condition) { ... } else { ... }
        const node = {
          type: "IfStatement",
          test: { type: "Identifier", name: "condition" },
          consequent: { type: "BlockStatement", body: [] },
          alternate: { type: "BlockStatement", body: [] },
        };

        visitor.IfStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: "noIfStatement",
        });
      });

      it("reports if statement with complex condition", () => {
        // AST for: if (!result.success) { ... }
        const node = {
          type: "IfStatement",
          test: {
            type: "UnaryExpression",
            operator: "!",
            argument: {
              type: "MemberExpression",
              object: { type: "Identifier", name: "result" },
              property: { type: "Identifier", name: "success" },
            },
          },
          consequent: { type: "BlockStatement", body: [] },
        };

        visitor.IfStatement(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node,
          messageId: "noIfStatement",
        });
      });

      it("does not report if statement inside mock() function", () => {
        // Simulate entering a mock() call
        const mockCallNode = {
          type: "CallExpression",
          callee: { type: "Identifier", name: "mock" },
        };
        visitor.CallExpression(mockCallNode);

        const ifNode = {
          type: "IfStatement",
          test: { type: "Identifier", name: "condition" },
          consequent: { type: "BlockStatement", body: [] },
        };

        visitor.IfStatement(ifNode);

        expect(reportMock).toHaveBeenCalledTimes(0);
      });

      it("reports if statement after exiting mock() function", () => {
        // Simulate entering and exiting a mock() call
        const mockCallNode = {
          type: "CallExpression",
          callee: { type: "Identifier", name: "mock" },
        };
        visitor.CallExpression(mockCallNode);
        visitor["CallExpression:exit"](mockCallNode);

        const ifNode = {
          type: "IfStatement",
          test: { type: "Identifier", name: "condition" },
          consequent: { type: "BlockStatement", body: [] },
        };

        visitor.IfStatement(ifNode);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: ifNode,
          messageId: "noIfStatement",
        });
      });

      it("reports if statement when inside non-mock CallExpression", () => {
        // Simulate entering a non-mock call
        const describeCallNode = {
          type: "CallExpression",
          callee: { type: "Identifier", name: "describe" },
        };
        visitor.CallExpression(describeCallNode);

        const ifNode = {
          type: "IfStatement",
          test: { type: "Identifier", name: "condition" },
          consequent: { type: "BlockStatement", body: [] },
        };

        visitor.IfStatement(ifNode);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: ifNode,
          messageId: "noIfStatement",
        });
      });
    });
  });
});
