import { codeFrameColumns } from '@babel/code-frame';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';

interface IToolStackFrame {
  filePath: string;
  line: number;
  column: number;
}

interface IShellErrorLike {
  name: string;
  message?: string;
  exitCode?: number;
  stdout?: unknown;
  stderr?: unknown;
  stack?: string;
}

type WriteOutput = (chunk: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isShellErrorLike(value: unknown): value is IShellErrorLike {
  if (!isRecord(value)) {
    return false;
  }

  const nameValue = value['name'];
  if (typeof nameValue !== 'string') {
    return false;
  }

  return nameValue === 'ShellError';
}

function isTraceEnabled(logger: TsLogger): boolean {
  return logger.isTracingEnabled();
}

function normalizeMultiline(value: string): string {
  const normalizedValue = value.endsWith('\n') ? value : `${value}\n`;
  return normalizedValue;
}

function buildToolStackFrame(filePath: string, line: number, column: number): IToolStackFrame {
  const result: IToolStackFrame = {
    filePath,
    line,
    column,
  };
  return result;
}

function parseToolFrameWithColumn(stackLine: string, regex: RegExp): IToolStackFrame | null {
  const match = regex.exec(stackLine);
  if (!match) {
    return null;
  }

  const filePath = match[1];
  const line = Number(match[2]);
  const column = Number(match[3]);

  if (!filePath || Number.isNaN(line) || Number.isNaN(column)) {
    return null;
  }

  const result = buildToolStackFrame(filePath, line, column);
  return result;
}

function parseToolFrameLineOnly(stackLine: string): IToolStackFrame | null {
  const match = /([^\s]+\.tool\.ts):(\d+)\s*$/.exec(stackLine);
  if (!match) {
    return null;
  }

  const filePath = match[1];
  const line = Number(match[2]);

  if (!filePath || Number.isNaN(line)) {
    return null;
  }

  const result = buildToolStackFrame(filePath, line, 1);
  return result;
}

function parseFirstToolFrame(stack: string): IToolStackFrame | null {
  const stackLines = stack.split('\n');

  for (const stackLine of stackLines) {
    if (!stackLine.includes('.tool.ts')) {
      continue;
    }

    const frameFromParen = parseToolFrameWithColumn(stackLine, /\(([^)]+\.tool\.ts):(\d+):(\d+)\)\s*$/);
    if (frameFromParen) {
      return frameFromParen;
    }

    const frameFromBare = parseToolFrameWithColumn(stackLine, /\s+at\s+([^\s]+\.tool\.ts):(\d+):(\d+)\s*$/);
    if (frameFromBare) {
      return frameFromBare;
    }

    const frameFromLineOnly = parseToolFrameLineOnly(stackLine);
    if (frameFromLineOnly) {
      return frameFromLineOnly;
    }
  }

  return null;
}

async function buildToolCodeFrame(fileSystem: IFileSystem, frame: IToolStackFrame): Promise<string | null> {
  const exists = await fileSystem.exists(frame.filePath);
  if (!exists) {
    return null;
  }

  const source = await fileSystem.readFile(frame.filePath, 'utf8');

  const codeFrame = codeFrameColumns(
    source,
    {
      start: {
        line: frame.line,
        column: frame.column,
      },
    },
    {
      linesAbove: 2,
      linesBelow: 2,
      highlightCode: true,
      forceColor: true,
    },
  );

  const result = `${frame.filePath}:${frame.line}:${frame.column}\n${codeFrame}\n`;
  return result;
}

function buildShellOutputDetails(error: IShellErrorLike): string {
  const chunks: string[] = [];

  const exitCode = typeof error.exitCode === 'number' ? String(error.exitCode) : 'unknown';
  chunks.push(`exit code: ${exitCode}`);

  const stderrValue = normalizeShellStream(error.stderr);
  if (stderrValue.length > 0) {
    chunks.push('stderr:');
    chunks.push(stderrValue);
  }

  const stdoutValue = normalizeShellStream(error.stdout);
  if (stdoutValue.length > 0) {
    chunks.push('stdout:');
    chunks.push(stdoutValue);
  }

  const result = chunks.join('\n');
  return result;
}

function normalizeShellStream(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Uint8Array) {
    const result = Buffer.from(value).toString('utf8');
    return result;
  }

  return '';
}

function buildNonShellErrorDetails(error: unknown, includeStack: boolean): string {
  const chunks: string[] = [];

  if (error instanceof Error) {
    chunks.push(`${error.name}: ${error.message}`);
    if (includeStack && typeof error.stack === 'string' && error.stack.length > 0) {
      chunks.push('stack:');
      chunks.push(error.stack);
    }

    const result = chunks.join('\n');
    return result;
  }

  chunks.push(String(error));

  const result = chunks.join('\n');
  return result;
}

interface IWriteHookErrorDetailsParams {
  fileSystem: IFileSystem;
  logger: TsLogger;
  hookName: string;
  toolName: string;
  error: unknown;
  writeOutput: WriteOutput;
}

async function buildCodeFrameSection(fileSystem: IFileSystem, stack: string | undefined): Promise<string | null> {
  if (!stack) {
    return null;
  }

  const toolFrame = parseFirstToolFrame(stack);
  if (!toolFrame) {
    return null;
  }

  const codeFrame = await buildToolCodeFrame(fileSystem, toolFrame);
  return codeFrame;
}

function buildStackLines(stack: string | undefined, includeStack: boolean): string[] {
  if (!includeStack) {
    const result: string[] = [];
    return result;
  }

  if (!stack || stack.length === 0) {
    const result: string[] = [];
    return result;
  }

  const result: string[] = ['stack:', stack];
  return result;
}

async function buildShellErrorVerboseSection(error: IShellErrorLike, includeStack: boolean): Promise<string[]> {
  const chunks: string[] = [buildShellOutputDetails(error)];

  const stack = typeof error.stack === 'string' ? error.stack : undefined;
  const stackLines = buildStackLines(stack, includeStack);
  chunks.push(...stackLines);

  const result: string[] = chunks;
  return result;
}

async function buildNonShellErrorVerboseSection(error: unknown, includeStack: boolean): Promise<string[]> {
  const chunks: string[] = [buildNonShellErrorDetails(error, includeStack)];

  const result: string[] = chunks;
  return result;
}

async function buildHookErrorOutput(params: IWriteHookErrorDetailsParams): Promise<string> {
  const includeVerbose = isTraceEnabled(params.logger);
  const chunks: string[] = [];

  // Get the stack from the error
  const stack = getErrorStack(params.error);

  // Build the code frame section (always shown if available)
  const codeFrame = await buildCodeFrameSection(params.fileSystem, stack);
  if (codeFrame) {
    chunks.push('---');
    chunks.push(codeFrame);
    chunks.push('---');
  }

  // In verbose mode, also include detailed error info
  if (includeVerbose) {
    if (isShellErrorLike(params.error)) {
      const verboseLines = await buildShellErrorVerboseSection(params.error, true);
      chunks.push(...verboseLines);
    } else {
      const verboseLines = await buildNonShellErrorVerboseSection(params.error, true);
      chunks.push(...verboseLines);
    }
  }

  if (chunks.length === 0) {
    return '';
  }

  const output = normalizeMultiline(chunks.join('\n'));
  return output;
}

function getErrorStack(error: unknown): string | undefined {
  if (isShellErrorLike(error)) {
    return typeof error.stack === 'string' ? error.stack : undefined;
  }
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

export async function writeHookErrorDetails(params: IWriteHookErrorDetailsParams): Promise<void> {
  const output = await buildHookErrorOutput(params);
  if (output.length > 0) {
    params.writeOutput(output);
  }
}
