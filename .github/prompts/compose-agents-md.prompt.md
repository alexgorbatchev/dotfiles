---
mode: agent
tools: ['runCommands', 'edit']
---

Your job is to review the production code in specified <LOCATION> from start to finish and create a system design document that describes the architecture. The system design document should include the following:

1. Overview of the system architecture
2. Description of key components and their responsibilities
3. Data flow and interaction between components
4. Error handling and logging strategies

Place the system design document into `<LOCATION>/AGENTS.md` file. If the file already exists you must bring it up to date.

## Important

- Use systematic file reading approach, not search-based detection
- Use mermaid charts to describe the data flow and interaction between components, DO NOT use ASCII charts
- Do not include function implementation details or other large chunks of production code
- Do not include details related to testing or logging
- The target audience for the document is LLM agent, humans will not be reading or reviewing it, optimize for machine readability

You must use this command to read all files in directory:
```
rg --files {dir} -g '*.ts' -g '*.tsx' -g '!log-messages.ts' -g '!**/__tests__/*' | while read -r file; do \
  echo ""; \
  echo "=== $(basename "$file") ==="; \
  echo ""; \
  cat "$file"; \
  echo ""; \
done
```
