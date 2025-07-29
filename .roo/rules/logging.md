# Structured Logging

- The project uses `tslog` for structured logging.
- An instance of a logger is created and passed into each class or function.
- A logger instance can be created either in a test or at the application entry point.

To create a logger instance:

```typescript
import { Logger } from 'tslog';
const logger = new Logger();
```

A sublogger must be created for each class, method and function:

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

In tests, an instance of `TestLogger` from `@testing-helpers` must be used. `TestLogger` WILL NOT log to `stderr` or `stdout`. It is used to capture logs for testing.

```typescript
import { TestLogger } from '@testing-helpers';

beforeEach(() => {
  logger = new TestLogger();
  testTarget = new TestTarget(logger);
});

it('...', () => {
  const logs = logger.getLogs(['TRACE'], ['TestTarget', 'myMethod']);

  /*
  `logs` content is [ 
    {
      "0": "message1",
      "1": "message2",
      "2": {
        toolName: "...",
        toolConfig: [Object ...],
        options: undefined,
      },
      _meta: {
        logLevelName: "TRACE",
        name: "myMethod",
        parentNames: [ "TestTarget" ],
        ...
      },
    }
  ];
  */

  // Use `printLogs` to print the logs to console FOR DEBUGGING PURPOSES ONLY.
  // `printLogs` must be always removed from tests before completing the task.
  logger.printLogs(['TRACE'], ['TestTarget', 'myMethod']);
});
```

## Log Levels

The project must support the following log levels:
  - `TRACE`, `DEBUG`: These messages are must be used for internal tracing and debugging. They are not user facing and may include objects.
  - `INFO`, `WARN`, `ERROR`, `FATAL`: Printed to `stderr` and `stdout` and are user facing. Log messages at these levels must be human readable and must never include objects.
