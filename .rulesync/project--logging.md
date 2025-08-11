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
- Each log template must be single responsibility and must not be reused in different contexts.
- Log templates must not change logged values.
- Code must not have any `console.[fn]` statements.
- There must not be duplicate consequitive logger call with the same message, eg `logger.error('message')` followed by `logger.debug('message')`. 
- src/modules/logger/README.md must be used for all log messages.
