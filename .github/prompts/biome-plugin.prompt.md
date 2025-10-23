# Biome GritQL Plugins - Complete Knowledge Dump

## Overview

Biome supports linter plugins using GritQL (Grit Query Language), a query language for performing structural searches on source code. These plugins allow custom lint rules without modifying Biome's core.

## Core Concepts

### What is GritQL?

- **Structural Pattern Matching**: Matches code structure, ignoring formatting details like whitespace, quote styles, and indentation
- **Language Agnostic**: Supports multiple languages (JavaScript, TypeScript, CSS, etc.)
- **Tree-Based**: Works on Abstract Syntax Trees (AST), not raw text
- **Declarative**: Define what to match, not how to search

### Plugin Architecture

```
Project Root
├── .biome/                    # Plugin directory (can be anywhere)
│   ├── my-rule.grit          # Plugin file
│   └── another-rule.grit     # Another plugin
└── biome.json                # Configuration
```

## Plugin Configuration

### biome.json Setup

```json
{
  "plugins": [
    "./.biome/my-rule.grit",
    "./path/to/another-rule.grit"
  ]
}
```

- Plugins are relative paths to `.grit` files
- Plugins run on all supported files during `biome lint` and `biome check`
- No distribution mechanism yet - plugins must be in project

## GritQL Plugin Syntax

### Basic Structure

```grit
engine biome(1.0)
language js(typescript,jsx)

PATTERN where {
    register_diagnostic(
        span = VARIABLE,
        message = "Diagnostic message"
    )
}
```

### Required Elements

1. **Engine Declaration**: `engine biome(1.0)` - specifies Biome as execution engine
2. **Language Declaration**: `language js(typescript,jsx)` or `language css`
3. **Pattern**: What code to match
4. **Diagnostic Registration**: Report issues via `register_diagnostic()`

## Pattern Matching Approaches

### 1. Code Snippet Patterns (Backticks)

Match code structure using backticks:

```grit
`console.log($message)` where {
    register_diagnostic(
        span = $message,
        message = "No console.log allowed"
    )
}
```

**Characteristics**:
- Ignores whitespace, formatting, quote styles
- Uses metavariables (`$var`) to capture parts
- Simple but may not work for all AST structures

### 2. Biome Syntax Node Patterns (Recommended)

Match Biome's internal AST nodes:

```grit
JsCallExpression(
    callee = JsStaticMemberExpression(
        object = $console,
        member = $method
    )
) as $call where {
    $console <: `console`,
    $method <: or { `log`, `warn`, `error` },
    register_diagnostic(
        span = $call,
        message = "No console methods allowed"
    )
}
```

**Advantages**:
- More precise control
- Works reliably for complex structures
- Matches Biome's exact AST representation

### How to Find Node Names

1. Use Biome Playground - inspect syntax tree
2. Check `.ungram` files in `xtask/codegen` directory
3. Common patterns: `JsCallExpression`, `JsIfStatement`, `JsExportNamedFromClause`, etc.

## Metavariables

### Anonymous Variable: `$_`

Matches anything without capturing:

```grit
`console.log($_)` where {
    register_diagnostic(span = $_) // Error: can't reference $_
}
```

### Named Variables: `$name`

Capture and reference matched code:

```grit
`console.$method($message)` where {
    register_diagnostic(
        span = $method,
        message = "Found console.$method with message: $message"
    )
}
```

### Spread Variables: `$...`

Match zero or more items:

```grit
`console.log($first, $...)` where {
    register_diagnostic(span = $first)
}
```

## Conditions and Operators

### Match Operator: `<:`

Test if variable matches pattern:

```grit
`$fn($args)` where {
    $fn <: `Object.assign`,
    register_diagnostic(span = $fn, message = "Use spread instead")
}
```

### Or Operator: `or { }`

Match any of multiple patterns:

```grit
`console.$method($_)` where {
    $method <: or { `log`, `info`, `warn`, `error` },
    register_diagnostic(span = $method)
}
```

### Not Operator: `not`

Negate a condition:

```grit
`$selector { $props }` where {
    $props <: contains `color: $color`,
    not $selector <: r"\.color-.*",
    register_diagnostic(span = $selector)
}
```

### Contains Operator: `contains`

Match if node contains pattern anywhere:

```grit
`await $expr` where {
    $expr <: contains `expect($_)`,
    register_diagnostic(
        span = $expr,
        message = "await before expect does nothing"
    )
}
```

### Within Operator: `within`

Check if current node is inside another pattern:

```grit
`$message <: within range(start_line=2, end_line=5)` where {
    register_diagnostic(span = $message)
}
```

## Regular Expressions

Use `r"pattern"` for regex matching:

```grit
`$selector { $props }` where {
    not $selector <: r"\.color-.*",
    register_diagnostic(span = $selector)
}
```

With capture groups:

```grit
`$filename` where {
    $filename <: r"(.*)\.js$"($base_name),
    register_diagnostic(message = "Base name: $base_name")
}
```

## register_diagnostic() API

### Required Parameters

- `span`: The AST node to highlight (must be a captured variable)
- `message`: Error message to display

### Optional Parameters

- `severity`: One of `"hint"`, `"info"`, `"warn"`, `"error"` (default: `"error"`)

### Examples

```grit
register_diagnostic(
    span = $node,
    message = "Custom error message"
)

register_diagnostic(
    span = $node,
    message = "This is just a warning",
    severity = "warn"
)
```

## Language Support

### JavaScript/TypeScript

```grit
language js(typescript,jsx)
```

Variants:
- `js` - JavaScript (defaults to TypeScript with JSX)
- `js(typescript)` - TypeScript without JSX
- `js(jsx)` - JavaScript with JSX
- `js(typescript,jsx)` - TypeScript with JSX (recommended)

### CSS

```grit
language css

`$selector { $props }` where {
    $props <: contains `color: $color` as $rule,
    not $selector <: r"\.color-.*",
    register_diagnostic(
        span = $rule,
        message = "Don't set explicit colors"
    )
}
```

### Future Languages

Other languages planned but not yet supported in plugins.

## Predefined Metavariables

- `$program`: Entire program/file
- `$filename`: Current file path (relative)

```grit
`console.log($message)` where {
    $program <: contains `logger`,
    register_diagnostic(span = $message)
}
```

## Advanced Patterns

### Bubble Scoping

Limit metavariable scope:

```grit
bubble($var1, $var2) PATTERN where {
    // $var1 and $var2 are isolated
    // other variables don't leak out
}
```

### Sequential Patterns

Apply multiple patterns in order:

```grit
sequential {
    `console.log($msg)` => `console.warn($msg)`,
    `console.warn($msg)` => `console.error($msg)`
}
```

Note: Sequential only works at top level, not in plugins.

### As Clause

Assign pattern to variable:

```grit
`export { $_ } from $_` as $export where {
    register_diagnostic(span = $export)
}
```

## Common Pitfalls

### 1. Using Backtick Patterns for Complex Structures

**Problem**: `export { $_ } from $_` might not match
**Solution**: Use AST nodes: `JsExportNamedFromClause()`

### 2. Referencing Anonymous Variable

**Problem**: Can't use `$_` in `span =`
**Solution**: Use named variables

### 3. Wrong Node Name

**Problem**: Guessing AST node names
**Solution**: Check Biome Playground or `.ungram` files

### 4. Forgetting Language Variants

**Problem**: Pattern doesn't match TypeScript
**Solution**: Use `language js(typescript,jsx)`

### 5. Missing Engine Declaration

**Problem**: Plugin doesn't load
**Solution**: Always start with `engine biome(1.0)`

## Best Practices

### 1. Use AST Nodes for Reliability

Prefer `JsCallExpression()` over backtick patterns for complex matching.

### 2. Be Specific with Span

Point `span =` to the exact node users should focus on:

```grit
`$fn($args)` where {
    $fn <: `Object.assign`,
    register_diagnostic(span = $fn, message = "...")  // span points to function name
}
```

### 3. Write Clear Messages

```grit
// ❌ Bad
message = "Don't do this"

// ✅ Good  
message = "Use `export * from` instead of `export { ... } from` for better maintainability."
```

### 4. Test Incrementally

1. Start with simple pattern
2. Verify it matches in `biome search`
3. Add conditions one at a time
4. Test with real code examples

### 5. Use Appropriate Severity

- `error`: Code that should always be fixed
- `warn`: Suspicious code, but might be intentional
- `info`: Suggestions for improvement
- `hint`: Minor style recommendations

## Debugging Plugins

### Test Pattern with biome search

```bash
biome search 'JsCallExpression()' src/
```

### Check Plugin Loading

Plugins load automatically if:
1. Path in `biome.json` is correct
2. File has `.grit` extension
3. Syntax is valid

### Common Issues

- **No diagnostics appear**: Check node name, language variant
- **Parse errors**: Verify GritQL syntax
- **Wrong matches**: Inspect AST in playground or test with different patterns

## Real-World Examples

### Biome Plugin Examples

#### Example 1: Prevent Object.assign (Biome Docs)

```grit
engine biome(1.0)
language js(typescript,jsx)

`$fn($args)` where {
    $fn <: `Object.assign`,
    register_diagnostic(
        span = $fn,
        message = "Prefer object spread instead of `Object.assign()`"
    )
}
```

#### Example 2: Enforce Color Classes (Biome Docs)

```grit
engine biome(1.0)
language css

`$selector { $props }` where {
    $props <: contains `color: $color` as $rule,
    not $selector <: r"\.color-.*",
    register_diagnostic(
        span = $rule,
        message = "Don't set explicit colors. Use `.color-*` classes instead."
    )
}
```

### GritQL Pattern Examples (From Official Docs)

These examples demonstrate GritQL syntax. To adapt for Biome plugins:
- Change `engine marzano(0.1)` to `engine biome(1.0)`
- Replace `=> .` or `=> PATTERN` with `register_diagnostic()`

#### Pattern Matching

**Code Snippets with Metavariables** (docs.grit.io/language/patterns)

```grit
engine marzano(0.1)
language js

`console.log($message)` => `console.warn($message)`
```

**Anonymous and Spread Metavariables** (docs.grit.io/language/patterns)

```grit
engine marzano(0.1)
language js

# Anonymous: $_ matches any single node
`console.log($_)`

# Spread: $... matches zero or more nodes
`console.log($message, $...)` => `// Removed console.log: $message`
```

**AST Node Matching** (docs.grit.io/language/patterns)

```grit
engine marzano(0.1)
language js

# Match augmented assignments with specific operator
augmented_assignment_expression(operator = $op, left = $x, right = $v)
```

**Regular Expressions with Captures** (docs.grit.io/language/patterns)

```grit
engine marzano(0.1)
language js

`console.log("$message")` where {
    $name = "Lucy",
    $message <: r`([a-zA-Z]*), $name`($greeting) => `$name, $greeting`
}
# Before: console.log("Hello, Lucy")
# After: console.log("Lucy, Hello")
```

**File and Program Patterns** (docs.grit.io/language/patterns)

```grit
engine marzano(0.1)
language js

# Only rewrite console.log if file uses logger
`console.log($log)` => `logger.log($log)` where {
    $program <: contains `logger`
}
```

**Range Patterns** (docs.grit.io/language/patterns)

```grit
engine marzano(0.1)
language js

# Remove console.log on specific lines
`console.log($_)` as $log => . where {
    $log <: contains or {
        range(start_line=2, end_line=2),
        range(start_line=5, end_line=6)
    }
}
```

#### Conditions

**Match Operator** (docs.grit.io/language/conditions)

```grit
engine marzano(0.1)
language js

`console.log('$message')` where $message <: `Hello, world!`
```

**Negation** (docs.grit.io/language/conditions)

```grit
engine marzano(0.1)
language js

`console.log('$message');` => `console.warn('$message');` where {
    ! $message <: "Hello, world!"
}
```

**And Condition** (docs.grit.io/language/conditions)

```grit
engine marzano(0.1)
language js

`console.$method('$message');` => `console.warn('$message');` where {
    and {
        $message <: r"Hello, .*!",
        $method <: `log`
    }
}
```

**Or Condition** (docs.grit.io/language/conditions)

```grit
engine marzano(0.1)
language js

`console.$method('$message');` => `console.warn('$message');` where {
    or {
        $message <: "Hello, world!",
        $method <: `error`
    }
}
```

**If Condition** (docs.grit.io/language/conditions)

```grit
engine marzano(0.1)
language js

`$method('$message')` where {
    if ($message <: r"Hello, .*!") {
        $method => `console.info`
    } else {
        $method => `console.warn`
    }
}
```

**Assignment** (docs.grit.io/language/conditions)

```grit
engine marzano(0.1)
language js

`console.log($message)` as $log where {
    $new_log_call = `logger.log($message)`,
    $log => $new_log_call
}
```

#### Modifiers

**And Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

arrow_function($body) where $body <: and {
    contains js"React.useState" => js"useState",
    contains js"React.useMemo" => js"useMemo",
}
```

**Or Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

arrow_function($body) where $body <: or {
    contains js"React.useState" => js"useState",
    contains js"React.useMemo" => js"useMemo",
}
```

**Any Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Non-short-circuiting version of or
arrow_function($body) where $body <: any {
    contains js"React.useState" => js"useState",
    contains js"React.useMemo" => js"useMemo",
}
```

**Not Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

`$method($message)` => `console.warn($message)` where {
    $method <: not `console.error`
}
```

**Maybe Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

`throw new Error($err)` as $thrown => `throw new CustomError($err);` where {
    $err <: maybe string(fragment=$fun) => `{ message: $err }`
}
```

**Contains Operator** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match functions with argument named 'x'
`function ($args) { $body }` where {
    $args <: contains `x`
}
```

**Until Modifier** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Stop traversal at sanitized() calls
`console.$_($content)` where {
    $content <: contains `secret` until `sanitized($_)`
}
```

**As Modifier** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

`function $name ($args) { $body }` as $func where {
    $func => `const $name = ($args) => { $body }`,
    $args <: contains `apple` => `mango`
}
```

**Within Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match console.log only inside if (DEBUG)
`console.log($arg)` where {
    $arg <: within `if (DEBUG) { $_ }`
}
```

**After Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match console.warn after console.log
`console.warn($_)` as $warn where {
    $warn <: after `console.log($_)`
}
```

**Before Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match console.warn before console.log
`console.warn($_)` as $warn where {
    $warn <: before `console.log($_)`
}
```

**Some Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match if list contains "andrew"
`var $x = [$names]` => `var coolPeople = [$names]` where {
    $names <: some { `"andrew"` }
}
```

**Every Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match if all elements are "andrew" or "alex"
`var $x = [$names]` => `var coolPeople = [$names]` where {
    $names <: every or {`"andrew"`, `"alex"`}
}
```

**List Patterns** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match exact ordered list
`var $x = [$numbers]` => `var firstPrimes = [$numbers]` where {
    $numbers <: [`2`, `3`, `5`]
}
```

**... Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Match with gaps in list
`var $x = [$numbers]` => `var firstPrimes = [$numbers]` where {
    $numbers <: [`2`, `3`, ..., `11`]
}
```

**Limit Clause** (docs.grit.io/language/modifiers)

```grit
engine marzano(0.1)
language js

# Only match in 2 files
`console.$method($message)` => `console.warn($message)` where {
    $method <: not `error`
} limit 2
```

#### Functions

**Custom Functions** (docs.grit.io/language/functions)

```grit
engine marzano(0.1)
language js

function lines($string) {
    return split($string, separator=`\n`)
}

`module.exports = $_` as $x => lines(string = $x)
```

**JavaScript Functions** (docs.grit.io/language/functions)

```grit
engine marzano(0.1)
language js

function fizzbuzz($x) js {
    const parsed = parseInt($x.text, 10);
    let output = '';
    if (parsed % 3 === 0) output += 'Fizz';
    if (parsed % 5 === 0) output += 'Buzz';
    return output || parsed;
}

`console.log($x)` => fizzbuzz($x)
```

**Built-in Functions** (docs.grit.io/language/functions)

```grit
engine marzano(0.1)
language js

# capitalize: "hello" -> "Hello"
capitalize(string = "hello")

# trim: "  hello  " -> "hello"
trim(string = "  hello  ", trim_chars = " ")

# join: ["a", "b", "c"] -> "a_b_c"
join(list = ["a", "b", "c"], separator = "_")

# split: "a_b_c" -> ["a", "b", "c"]
split(string = "a_b_c", separator = "_")

# uppercase: "hello" -> "HELLO"
uppercase(string = "hello")

# lowercase: "HELLO" -> "hello"
lowercase(string = "HELLO")

# length: [7, 8, 9] -> 3
length(target=[7, 8, 9])

# distinct: [1, 2, 3, 2, 1] -> [1, 2, 3]
distinct(list = [1, 2, 3, 2, 1])
```

**Todo Function** (docs.grit.io/language/functions)

```grit
engine marzano(0.1)
language js

or {
    `console.log($msg)` => todo(target=$msg),
    `console.error($msg)` as $log => todo(
        target=$log,
        message="Consider a lower error level."
    )
}
```

#### Idioms

**List and String Accumulation** (docs.grit.io/language/idioms)

```grit
engine marzano(0.1)
language js

`namedColors = { $colors }` where {
    $keys = "",
    $values = [],
    $colors <: some bubble($keys, $values) `$name: $color` where {
        $keys += $name,
        $values += `$color`
    },
    $new_colors = join(list=$values, separator=", ")
} => `$keys = [ $new_colors ]`
```

**Creating New Files** (docs.grit.io/language/idioms)

```grit
engine marzano(0.1)
language js

`function $functionName($_) {$_}` as $f where {
    $functionName <: r"test.*",
    $f => .,
    $new_file_name = `$functionName.test.js`,
    $new_files += file(name = $new_file_name, body = $f)
}
```

**Accessing Current Filename** (docs.grit.io/language/idioms)

```grit
engine marzano(0.1)
language js

`function $functionName($_) {$_}` as $f where {
    $functionName <: r"test.*",
    $f => .,
    $filename <: r"(.*)\.js$"($base_name),
    $new_file_name = `$base_name.test.js`,
    $new_files += file(name = $new_file_name, body = $f)
}
```

**Specific Rewrites** (docs.grit.io/language/idioms)

```grit
engine marzano(0.1)
language js

# ❌ Not specific - loses async keyword and comments
`function foo($args) { $body }` => `function bar($args) {$body} `

# ✅ Specific - preserves async and comments
`function $name($args) { $body }` where {
    $name <: `foo` => `bar`
}
```

**Targeting Specific Code Blocks** (docs.grit.io/language/idioms)

```grit
engine marzano(0.1)
language js

# Target console.log on line 2 of stuff.js
`console.log($message)` where {
    $message <: within range(start_line=2, end_line=2),
    $filename <: includes "stuff.js"
}
```

### Grit Stdlib Examples

#### Remove console.log

```grit
engine marzano(0.1)
language js

`console.log($arg)` => . where {
    $arg <: not within catch_clause()
}
```

#### No Array Constructor

```grit
engine marzano(0.1)
language js

or {
    `new Array($args)` => `[$args]`,
    `Array($args)` => `[$args]`
} where {
    $args <: [$_, $_, ...]
}
```

#### Remove debugger Statement

```grit
engine marzano(0.1)
language js

debugger_statement() => .
```





## Quick Reference Card

```grit
# Template
engine biome(1.0)
language js(typescript,jsx)

PATTERN where {
    CONDITION,
    register_diagnostic(
        span = VARIABLE,
        message = "MESSAGE",
        severity = "error"  # optional
    )
}

# Patterns
`code snippet`                    # Code pattern
JsNodeName()                       # AST node
$var                               # Named variable
$_                                 # Anonymous variable
$...                               # Spread variable

# Conditions
$var <: PATTERN                    # Match operator
or { P1, P2 }                      # Or condition
not PATTERN                        # Negation
contains PATTERN                   # Contains check
within PATTERN                     # Context check
r"regex"                           # Regex match
r"regex"($cap1, $cap2)            # Regex with captures

# Common Nodes (JavaScript)
JsCallExpression()                 # Function call
JsIfStatement()                    # If statement
JsExportNamedFromClause()         # export { } from
JsImportDeclaration()             # import statement
JsArrowFunctionExpression()       # Arrow function
JsClassDeclaration()              # Class declaration

see https://docs.rs/biome_js_syntax/latest/biome_js_syntax/all.html for all nodes

# Severity Levels
"error"   # Default, must fix
"warn"    # Should fix
"info"    # Nice to fix
"hint"    # Minor suggestion
```


