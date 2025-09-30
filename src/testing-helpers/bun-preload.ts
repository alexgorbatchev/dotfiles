/** biome-ignore-all lint/suspicious/noExplicitAny: for console overrides */
const env = process.env;

if (env['BUN_CORRECT_TEST_COMMAND'] !== '1' && !process.argv[1]?.endsWith('bun-test-runner.ts')) {
  console.error('Use `bun run test` instead, takes the same arguments as `bun test`.');
  process.exit(1);
}

env['NODE_ENV'] = 'test';

// Helper function to extract caller information from stack trace
function getCallerInfo(): string {
  const stack = captureStackTrace();
  if (!stack) return '';

  const lines = stack.split('\n');
  const callerLine = findCallerLine(lines);
  return callerLine ? formatCallerInfo(callerLine) : '';
}

/**
 * Capture stack trace with increased limit
 */
function captureStackTrace(): string | null {
  const dummyObject = {};
  const originalStackTraceLimit = Error.stackTraceLimit;

  // Increase stack trace limit temporarily to ensure we get enough frames
  Error.stackTraceLimit = 20;

  // Capture stack trace, excluding this function from the trace
  Error.captureStackTrace(dummyObject, getCallerInfo);

  const stack = (dummyObject as any).stack;

  // Restore original stack trace limit
  Error.stackTraceLimit = originalStackTraceLimit;

  return stack;
}

/**
 * Find the first line in the stack that represents actual project source code
 */
function findCallerLine(lines: string[]): string | null {
  // Files/paths to skip when looking for the caller
  const skipPatterns = [
    'bun-preload.ts',
    'BaseLogger.js', // tslog
    'node_modules/',
    'native:', // Node.js internal
    'unknown', // Unknown source
  ];

  // Find the first line that's from the actual project source code
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip lines that match our skip patterns
    const shouldSkip = skipPatterns.some((pattern) => line.includes(pattern));
    if (shouldSkip) continue;

    return line;
  }

  return null;
}

/**
 * Format caller information from stack trace line
 */
function formatCallerInfo(line: string): string {
  // Extract file path and line number from stack trace line
  // Format: "    at functionName (file:///path/to/file.ts:line:column)"
  const match = line.match(/\(([^)]+):(\d+):(\d+)\)/);
  if (match) {
    const [, filePath, lineNumber] = match;
    if (filePath) {
      // Extract just the filename from the full path
      const filename = filePath.split('/').pop() || filePath;
      return ` (${filename}:${lineNumber})`;
    }
  }

  // Alternative format: "    at file:///path/to/file.ts:line:column"
  const altMatch = line.match(/at\s+([^:]+):(\d+):(\d+)/);
  if (altMatch) {
    const [, filePath, lineNumber] = altMatch;
    if (filePath) {
      const filename = filePath.split('/').pop() || filePath;
      return ` (${filename}:${lineNumber})`;
    }
  }

  return '';
}

// Helper function to write headers using process.stdout
const writeHeader = (header: string): void => {
  const callerInfo = getCallerInfo();
  process.stdout.write(`${header}${callerInfo} ⟩⟩⟩\n`);
};

// Helper function to write footer using process.stdout
const writeFooter = (): void => {
  process.stdout.write(`⟨⟨⟨\n\n`);
};

// Wrapper function that adds header and footer to console methods
const wrapConsoleMethod = <T extends (...args: any[]) => any>(
  methodName: string,
  originalMethod: T,
  skipFooter = false
): T => {
  return ((...args: any[]) => {
    writeHeader(methodName);
    const result = originalMethod(...args);
    if (!skipFooter) {
      writeFooter();
    }
    return result;
  }) as T;
};

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  trace: console.trace.bind(console),
  dir: console.dir.bind(console),
  dirxml: console.dirxml.bind(console),
  table: console.table.bind(console),
  time: console.time.bind(console),
  timeEnd: console.timeEnd.bind(console),
  timeLog: console.timeLog.bind(console),
  group: console.group.bind(console),
  groupEnd: console.groupEnd.bind(console),
  groupCollapsed: console.groupCollapsed.bind(console),
  clear: console.clear.bind(console),
  count: console.count.bind(console),
  countReset: console.countReset.bind(console),
  assert: console.assert.bind(console),
};

// Override console methods with passthrough + header + footer
console.log = wrapConsoleMethod('console.log', originalConsole.log);

console.error = wrapConsoleMethod('console.error', originalConsole.error);

console.warn = wrapConsoleMethod('console.warn', originalConsole.warn);

console.info = wrapConsoleMethod('console.info', originalConsole.info);

console.debug = wrapConsoleMethod('console.debug', originalConsole.debug);

console.trace = wrapConsoleMethod('console.trace', originalConsole.trace);

console.dir = wrapConsoleMethod('console.dir', originalConsole.dir);

console.dirxml = wrapConsoleMethod('console.dirxml', originalConsole.dirxml);

console.table = wrapConsoleMethod('console.table', originalConsole.table);

console.time = wrapConsoleMethod('console.time', originalConsole.time);

console.timeEnd = wrapConsoleMethod('console.timeend', originalConsole.timeEnd);

console.timeLog = wrapConsoleMethod('console.timelog', originalConsole.timeLog);

console.group = wrapConsoleMethod('console.group', originalConsole.group);

console.groupEnd = wrapConsoleMethod('console.groupend', originalConsole.groupEnd);

console.groupCollapsed = wrapConsoleMethod('console.groupcollapsed', originalConsole.groupCollapsed);

console.clear = wrapConsoleMethod('console.clear', originalConsole.clear);

console.count = wrapConsoleMethod('console.count', originalConsole.count);

console.countReset = wrapConsoleMethod('console.countreset', originalConsole.countReset);

console.assert = (condition?: boolean, ...data: any[]) => {
  if (!condition) {
    writeHeader('console.assert');
  }
  const result = originalConsole.assert(condition, ...data);
  if (!condition) {
    writeFooter();
  }
  return result;
};
