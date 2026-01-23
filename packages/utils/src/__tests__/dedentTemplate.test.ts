import { describe, expect, test } from 'bun:test';
import { dedentTemplate } from '../dedentTemplate';

describe('dedentTemplate', () => {
  test('should dedent a simple template', () => {
    const template = `
      Hello
        World
    `;
    const result = dedentTemplate(template, {});

    expect(result).toMatchInlineSnapshot(`
      "Hello
        World"
    `);
  });

  test('should replace placeholders with values', () => {
    const template = `
      Hello {name}
        How are you?
    `;
    const result = dedentTemplate(template, { name: 'World' });

    expect(result).toMatchInlineSnapshot(`
      "Hello World
        How are you?"
    `);
  });

  test('should handle multiline values with proper indentation', () => {
    const template = `
      <code>
        {code}
      </code>
    `;
    const values = {
      code: `function example() {
  return 42;
}`,
    };

    const result = dedentTemplate(template, values);

    expect(result).toMatchInlineSnapshot(`
      "<code>
        function example() {
          return 42;
        }
      </code>"
    `);
  });

  test('should handle multiple placeholders', () => {
    const template = `
      <user>
        {name}
      </user>
      <message>
        {message}
      </message>
    `;

    const values = {
      name: 'John',
      message: 'Hello\nWorld',
    };

    const result = dedentTemplate(template, values);

    expect(result).toMatchInlineSnapshot(`
      "<user>
        John
      </user>
      <message>
        Hello
        World
      </message>"
    `);
  });

  test('should replace inline placeholders', () => {
    const template = `
      Hello {name}, welcome to {place}!
    `;

    const values = {
      name: 'John',
      place: 'Earth',
    };

    const result = dedentTemplate(template, values);

    // Placeholders within text lines should be replaced
    expect(result).toMatchInlineSnapshot(`"Hello John, welcome to Earth!"`);
  });

  test('should handle complex indentation patterns', () => {
    const template = `
function main() {
  if (condition) {
    {codeBlock}
  }
}
    `;

    const values = {
      codeBlock: `console.log("Hello");
console.log("World");`,
    };

    const result = dedentTemplate(template, values);

    expect(result).toMatchInlineSnapshot(`
      "function main() {
        if (condition) {
          console.log("Hello");
          console.log("World");
        }
      }"
    `);
  });

  test('should handle multiple levels of indentation', () => {
    const template = `
      function nestedFunction() {
        if (true) {
          for (let i = 0; i < 10; i++) {
            {nestedCode}
          }
        }
      }
    `;

    const values = {
      nestedCode: `if (i % 2 === 0) {
  console.log("Even number:", i);
} else {
  console.log("Odd number:", i);
}`,
    };

    const result = dedentTemplate(template, values);

    expect(result).toMatchInlineSnapshot(`
      "function nestedFunction() {
        if (true) {
          for (let i = 0; i < 10; i++) {
            if (i % 2 === 0) {
              console.log("Even number:", i);
            } else {
              console.log("Odd number:", i);
            }
          }
        }
      }"
    `);
  });

  test('should produce properly indented code', () => {
    const template = `
function main() {
  {codeBlock}
}
    `;

    const values = {
      codeBlock: `if (condition) {
  for (let i = 0; i < 10; i++) {
    console.log(i);
    if (i % 2 === 0) {
      console.log("Even");
    } else {
      console.log("Odd");
    }
  }
}`,
    };

    const result = dedentTemplate(template, values);

    expect(result).toMatchInlineSnapshot(`
      "function main() {
        if (condition) {
          for (let i = 0; i < 10; i++) {
            console.log(i);
            if (i % 2 === 0) {
              console.log("Even");
            } else {
              console.log("Odd");
            }
          }
        }
      }"
    `);
  });
});
