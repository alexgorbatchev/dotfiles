---
description: TypeScript specific code quality requirements.
applyTo: '**/log-messages.ts'
---
# TypeScript Code Quality Requirements

**Exception for Log Message Objects**: Log message objects that follow the project's logging patterns can rely on type inference when:
- The object contains only log message functions using `createSafeLogMessage` or similar logging utilities
- Each property is a function that returns a log message
- The object is exported directly without intermediate variables

```typescript
// ✅ Good - Exception for log message objects
export const userLogMessages = {
  userCreated: (name: string) => createSafeLogMessage(`User ${name} created`),
};

// ❌ Still Bad - All other object literals need explicit types
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
};

const result = {
  success: true,
  data: processedData,
  timestamp: new Date(),
};
```