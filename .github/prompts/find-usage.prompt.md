---
agent: agent
---

# Property Usage Tracing Instructions for LLM

You are analyzing TypeScript code to determine if interface properties are actually used. Follow these steps exactly to produce a comprehensive trace.

## Step 1: Identify the Property

Input: Interface name and property name
Example: `UpdateCommandSpecificOptions.yes`

## Step 2: Find the Property Definition

Use `read_file` to locate and read the interface definition:

```
Property: <PropertyName>
Type: <PropertyType>
Location: <FilePath>:<LineNumber>
```

## Step 3: Search for CLI Option Registration

If this appears to be a CLI command option:

1. Use `grep_search` with pattern: `\.option.*--<property-name>`
2. Note the option registration line and flags

## Step 4: Find Action Handler

Search for where the interface is used as a parameter:

1. Use `grep_search` with pattern: `<InterfaceName>`
2. Look for function signatures like: `action(async (..., options: <InterfaceName>)`

## Step 5: Trace Type Transformations

Follow the data flow:

1. Identify where the parameter is merged/spread into new variables
2. Note any type annotations that change the nominal type
3. Example: `const combined: NewType = { ...original, ...other }`

## Step 6: Search for Property Access

Use `grep_search` with multiple patterns:

1. `options\.<property>`
2. `combinedOptions\.<property>`
3. `\.<property>` (broader search)
4. Any variable names that hold the options

## Step 7: Check Related Files

If property is passed to other functions/modules:

1. Identify the parameter type in the target function
2. Search that file for property access
3. Continue recursively if passed further

## Step 8: Format Output

Structure your output EXACTLY as follows:

```markdown
## Trace Result for `.<propertyName>` Property

**<InterfaceName>.<propertyName> is [USED|NOT USED]**

### Complete Trace:
```

1. Definition (<file>:<line>)
   └─> <InterfaceName> { <propertyName>: <type> }

2. CLI Registration (<file>:<line>) [if applicable]
   └─> .option('<flags>', '<description>', <default>)

3. Action Handler (<file>:<line>)
   └─> async (..., <paramName>: <InterfaceName>) => {

4. Merged with Global Options (<file>:<line>) [if applicable]
   └─> const <varName>: <NewType> = { ...<paramName>, ...<other> }

5. Re-declaration (<file>:<line>) [if type changes]
   └─> interface <NewType> extends <Base> {
   <propertyName>: <type>; ← Re-declared
   }

6. [✅ ACCESSED|❌ NEVER ACCESSED]
   └─> [If accessed: List all access points with file:line]
   [If not accessed: "No reference to <var>.<property> anywhere in the code"]

```
### Conclusion:

The `<propertyName>` property is:
- [✅|❌] Defined in `<InterfaceName>`
- [✅|❌] Re-declared in `<OtherInterface>` [if applicable]
- [✅|❌] Registered as a CLI option [if applicable]
- [✅|❌] **[ACCESSED|NEVER accessed] in logic**

[If unused:] This is a **genuinely unused property** - [explain why it might exist and suggest action]

[If used:] Property usage chain: `<Interface>.<property>` → [trace] → final usage at `<file>:<line>`
```

## Step 9: Verification Checklist

Before finalizing, verify:

- [ ] Checked the obvious variable names (options, combinedOptions, commandOptions)
- [ ] Searched for destructuring: `const { <property> } = options`
- [ ] Searched for spreading: `{ <property>: options.<property> }`
- [ ] Checked parameter passing to other functions
- [ ] Searched related test files
- [ ] Checked for type re-declarations that might break reference chain

## Step 10: Handle Special Cases

### Re-declaration Pattern

If you find the same property declared in multiple interfaces:

1. Note each declaration point
2. Explain the reference chain breaks at type changes
3. Still determine if property is ultimately accessed

### Spread/Destructure Pattern

```typescript
const { property } = options; // Direct access
const obj = { ...options }; // Passed through
const val = options.property; // Direct access
```

### Optional Chaining

```typescript
options?.property; // Access with optional chaining
options?.[propertyName]; // Dynamic access
```

## Example Commands

```bash
# Find interface definition
read_file(<file>, <start>, <end>)

# Search for property access
grep_search(query: "options\\.yes", isRegexp: true, includePattern: "**/*.ts")

# Search for option registration
grep_search(query: "\\.option.*--yes", isRegexp: true, includePattern: "<command-file>")

# Check for destructuring
grep_search(query: "\\{[^}]*yes[^}]*\\}", isRegexp: true, includePattern: "**/*.ts")
```

## Output Quality Standards

Your output must:

1. Be definitive: state clearly if property IS or IS NOT used
2. Show complete trace from definition to usage (or lack thereof)
3. Use exact file paths and line numbers
4. Format using the exact template above
5. Include ✅/❌ visual indicators
6. End with clear conclusion and recommendation
7. Use code blocks with proper syntax highlighting
8. Maintain consistent indentation in trace tree

## Error Handling

If you cannot find:

- **Definition**: State "Property definition not found in provided files"
- **Usage**: State "No usage found after exhaustive search" and list what you searched
- **Related files**: State "Unable to trace beyond <file> - external dependency"

Always explain gaps in your analysis.
