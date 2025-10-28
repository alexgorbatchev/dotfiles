---
description: Project logging requirements.
applyTo: '**/*'
---
# Project Logging Requirements

- The project uses `tslog` for structured logging.
- An instance of a logger is created (via `createTsLogger`) and passed into each class or function.
- A logger instance can be created either in a test or at the application entry point.
- Log message templates must only accept variables to customize the message. They must not include the message itself because of i18n.
- Log message templates must not be indented, formatting is handled by the logger.
- Log messages must not include method names, subloggers are used for this.
- Each log template must be single responsibility and must not be reused in different contexts.
- Log templates must not change logged values.
- Code must not have any `console.[fn]` statements.
- There must not be duplicate consequitive logger call with the same message, eg `logger.error('message')` followed by `logger.debug('message')`. 
- packages/logger/README.md must be used for all log messages.
- In a class, all methods must create a sublogger with the method name and use it (when modifying and exiting file and this pattern is not implemented, update the file to implement it).
- When calling a function or a method that uses a logger, there's no need to have a related logger call.
- Logger calls in catch blocks must be error.
- Do not pass objects or large amount of arguments into the logguing functions to avoid cluttering the logs. INFO, WARN and ERROR are always printed to the user and must easily readable.
- You can pass error in the catch block directly to the logger without extracting messages as logger will take care of all the formatting necessary.
- Do not log more than one message per event.
- Do not wrap function calls with begin and end logs, especially if those function have their own logging.
- `log-messages.ts` should export one `messages` object.
