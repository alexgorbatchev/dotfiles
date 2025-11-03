---
description: Project logging requirements.
applyTo: '**/*'
---
# Project Logging Requirements

The purpose of the logging is to provide insights into what application is doing to the END USER.
INFO, WARN and ERROR are always printed to the user and must easily readable.

## Important

- `packages/logger/README.md` must be used for all log messages.

- The project uses `tslog` for structured logging.
- Code must not have any `console.[fn]` statements.
- `log-messages.ts` should export one `messages` object.

- Log messages must be short and clear.
- Log messages will be translated to the user's language by another system.
- Values and strings passed into the logger can only represent system values and must not contain partial sentences in English.

- Log message templates must not be indented, formatting is handled by the logger.
- Log templates must not change logged values.
- Each log template must be single responsibility and must not be reused in different contexts.

- Only `main.ts` and tests can create new logger instances, everywhere else it must be passed in.
- Any function, method, or class that uses a logger must receive a logger instance as a parameter AND create a sublogger.
- Log messages must not include method names, subloggers are used for this.
- Do not log objects, arrays or long string/values.

- There must not be duplicate consequitive logger call with the same message, eg `logger.error('message')` followed by `logger.debug('message')`.
- Do not wrap function calls with begin and end logs, especially if those function have their own logging.
- Pass errors in the catch block directly to the logger without extracting messages, the logger will take care of the formatting.
- Do not log more than one message per event.

