import { beforeEach, describe, expect, it, mock } from 'bun:test';

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

    it('has messages for all matchers', () => {
      expect(rule.meta?.messages?.['noToContain']).toBeDefined();
      expect(rule.meta?.messages?.['noToMatch']).toBeDefined();
      expect(rule.meta?.messages?.['noToMatchRegex']).toBeDefined();
      expect(rule.meta?.messages?.['noIncludesWorkaround']).toBeDefined();
    });
  });

  describe('rule.create()', () => {
    const rule = plugin.rules['no-partial-string-matchers'];

    it('returns visitor with CallExpression handler', () => {
      const mockContext = { report: mock(() => {}) };
      const visitor = rule.create(mockContext) as ASTVisitor;

      expect(visitor.CallExpression).toBeFunction();
    });

    describe('CallExpression visitor', () => {
      let reportMock: ReturnType<typeof mock>;
      let visitor: ASTVisitor;

      beforeEach(() => {
        reportMock = mock(() => {});
        visitor = rule.create({ report: reportMock });
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

      it('reports toMatch() with string argument on expect chain', () => {
        // AST for: expect(value).toMatch('pattern')
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
          arguments: [{ type: 'Literal', value: 'pattern' }],
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: node.callee?.property,
          messageId: 'noToMatch',
        });
      });

      it('reports toMatch() with regex literal using noToMatchRegex message', () => {
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
          arguments: [{ type: 'Literal', regex: { pattern: 'pattern', flags: '' } }],
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: node.callee?.property,
          messageId: 'noToMatchRegex',
        });
      });

      it('reports toMatch() with new RegExp() using noToMatchRegex message', () => {
        // AST for: expect(value).toMatch(new RegExp('pattern'))
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
          arguments: [
            {
              type: 'NewExpression',
              callee: { type: 'Identifier', name: 'RegExp' },
              arguments: [{ type: 'Literal', value: 'pattern' }],
            },
          ],
        };

        visitor.CallExpression(node);

        expect(reportMock).toHaveBeenCalledTimes(1);
        expect(reportMock).toHaveBeenCalledWith({
          node: node.callee?.property,
          messageId: 'noToMatchRegex',
        });
      });

      it('does not report toContain() with .not modifier (negative assertions allowed)', () => {
        // AST for: expect(value).not.toContain('substring')
        // Negative assertions are useful and don't have the same false positive issues
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

        expect(reportMock).not.toHaveBeenCalled();
      });

      it('does not report toMatch() with .not modifier (negative assertions allowed)', () => {
        // AST for: expect(value).not.toMatch('pattern')
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
            property: { type: 'Identifier', name: 'toMatch' },
          },
          arguments: [{ type: 'Literal', value: 'pattern' }],
        };

        visitor.CallExpression(node);

        expect(reportMock).not.toHaveBeenCalled();
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

      describe('includes() workaround detection', () => {
        it('reports expect(str.includes()).toBe(true)', () => {
          // AST for: expect(strings[0].includes('bash')).toBe(true)
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: {
                        type: 'MemberExpression',
                        object: { type: 'Identifier', name: 'strings' },
                        property: { type: 'Literal', value: 0 },
                      },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'bash' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toBe' },
            },
            arguments: [{ type: 'Literal', value: true }],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('reports expect(str.includes()).toBe(false)', () => {
          // AST for: expect(scriptPath.includes('test.sh')).toBe(false)
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'scriptPath' },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'test.sh' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toBe' },
            },
            arguments: [{ type: 'Literal', value: false }],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('reports expect(str.includes()).not.toBe(false)', () => {
          // AST for: expect(strings[0].includes('bash')).not.toBe(false)
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'MemberExpression',
                object: {
                  type: 'CallExpression',
                  callee: { type: 'Identifier', name: 'expect' },
                  arguments: [
                    {
                      type: 'CallExpression',
                      callee: {
                        type: 'MemberExpression',
                        object: {
                          type: 'MemberExpression',
                          object: { type: 'Identifier', name: 'strings' },
                          property: { type: 'Literal', value: 0 },
                        },
                        property: includesProperty,
                      },
                      arguments: [{ type: 'Literal', value: 'bash' }],
                    },
                  ],
                },
                property: { type: 'Identifier', name: 'not' },
              },
              property: { type: 'Identifier', name: 'toBe' },
            },
            arguments: [{ type: 'Literal', value: false }],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('reports expect(str.includes()).toEqual(true)', () => {
          // AST for: expect(str.includes('x')).toEqual(true)
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'str' },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'x' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toEqual' },
            },
            arguments: [{ type: 'Literal', value: true }],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('reports expect(str.includes()).toStrictEqual(true)', () => {
          // AST for: expect(str.includes('x')).toStrictEqual(true)
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'str' },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'x' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toStrictEqual' },
            },
            arguments: [{ type: 'Literal', value: true }],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('does not report expect(value).toBe(true) without includes()', () => {
          // AST for: expect(value).toBe(true) - no includes call
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [{ type: 'Identifier', name: 'value' }],
              },
              property: { type: 'Identifier', name: 'toBe' },
            },
            arguments: [{ type: 'Literal', value: true }],
          };

          visitor.CallExpression(node);

          expect(reportMock).not.toHaveBeenCalled();
        });

        it('does not report expect(str.includes()).toBe("string") with non-boolean arg', () => {
          // AST for: expect(str.includes('x')).toBe('yes') - non-boolean argument
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'str' },
                      property: { type: 'Identifier', name: 'includes' },
                    },
                    arguments: [{ type: 'Literal', value: 'x' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toBe' },
            },
            arguments: [{ type: 'Literal', value: 'yes' }],
          };

          visitor.CallExpression(node);

          expect(reportMock).not.toHaveBeenCalled();
        });

        it('does not report standalone includes() call', () => {
          // AST for: str.includes('x') - not inside expect
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: { type: 'Identifier', name: 'str' },
              property: { type: 'Identifier', name: 'includes' },
            },
            arguments: [{ type: 'Literal', value: 'x' }],
          };

          visitor.CallExpression(node);

          expect(reportMock).not.toHaveBeenCalled();
        });

        it('reports expect(str.includes()).toBeTrue()', () => {
          // AST for: expect(str.includes('x')).toBeTrue()
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'str' },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'x' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toBeTrue' },
            },
            arguments: [],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('reports expect(str.includes()).toBeTruthy()', () => {
          // AST for: expect(str.includes('x')).toBeTruthy()
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'str' },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'x' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toBeTruthy' },
            },
            arguments: [],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('reports expect(str.includes()).toBeFalse()', () => {
          // AST for: expect(str.includes('x')).toBeFalse()
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'str' },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'x' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toBeFalse' },
            },
            arguments: [],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });

        it('reports expect(str.includes()).toBeFalsy()', () => {
          // AST for: expect(str.includes('x')).toBeFalsy()
          const includesProperty = { type: 'Identifier', name: 'includes' };
          const node = {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'expect' },
                arguments: [
                  {
                    type: 'CallExpression',
                    callee: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'str' },
                      property: includesProperty,
                    },
                    arguments: [{ type: 'Literal', value: 'x' }],
                  },
                ],
              },
              property: { type: 'Identifier', name: 'toBeFalsy' },
            },
            arguments: [],
          };

          visitor.CallExpression(node);

          expect(reportMock).toHaveBeenCalledTimes(1);
          expect(reportMock).toHaveBeenCalledWith({
            node: includesProperty,
            messageId: 'noIncludesWorkaround',
          });
        });
      });
    });
  });
});
