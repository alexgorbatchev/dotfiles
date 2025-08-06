---
root: false
targets: ["*"]
description: Project logging requirements.
globs:
  - '**/*'
---

# Project Logging Requirements

- The project uses `tslog` for structured logging.
- An instance of a logger is created and passed into each class or function.
- A logger instance can be created either in a test or at the application entry point.
- Log message templates must only accept variables to customize the message. They must not include the message itself.
- Log message templates must not be indented, formatting is handled by the logger.
- Log messages must not include method names, subloggers are used for this.
- Code must not have any `console.[fn]` statements.
- There must not be duplicate consequitive logger call with the same message, eg `logger.error('message')` followed by `logger.debug('message')`. 
- src/modules/shared/ErrorTemplates.ts must be used for all log messages.

## Usage

```typescript
import { Logger } from 'tslog';
const logger = new Logger();
```

A sublogger must be created for each class, method and function. `logger: Logger` must always be the first argument.

```typescript
class MyClass {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.getSubLogger({ name: 'MyClass' });
  }

  public myMethod(args: any) {
    const logger = this.logger.getSubLogger({ name: 'myMethod' });
    logger.info(args);
  }
}

function myFunction(logger: Logger, args: any) {
  const logger = logger.getSubLogger({ name: 'myFunction' });
  logger.info(args);
}
```

## Testing

In tests, an instance of `TestLogger` from `@testing-helpers` must be used. `TestLogger` WILL NOT log to `stderr` or `stdout`. It is used to capture logs for testing.

```typescript
import { TestLogger } from '@testing-helpers';

beforeEach(() => {
  logger = new TestLogger();
  testTarget = new TestTarget(logger);
});

it('...', () => {
  // will pass if all matchers are found exactly once in same order
  logger.expect(['TRACE'], ['TestTarget', 'myMethod'], ['message 1', /message 2/]);
});
```

## Log Levels

The project must support the following log levels:
  - `TRACE`: These messages are must be used for internal tracing and debugging. They are not user facing and may include objects.
  - `INFO`, `WARN`, `ERROR`, `FATAL`: Printed to `stderr` and `stdout` and are user facing. Log messages at these levels must be human readable and must never include objects.
