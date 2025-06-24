/**
 * This script shortens the `bun test` output by only showing passing files and the failing
 * tests details instead of the full output to save on token usage. A few more things could
 * have been cut, but the output is also ideally human readable.
 */
import * as fs from 'fs';
import { Transform, type TransformCallback } from 'stream';
import stripAnsi from 'strip-ansi';
import { $ } from 'zx';

let exitCode = 0;
const onlyFailingTests = true;
const watchMode = process.argv.includes('--watch');
const TIMEOUT = 10000;
const PASS = 'PASS: ';
const FAIL = 'FAIL: ';
const NL = '\n';

function maybeFilePath(line: string): string | undefined {
  if (!line.endsWith(':')) return undefined;
  const filePath = line.slice(0, -1);
  if (!fs.existsSync(filePath)) return undefined;
  return filePath;
}

const isPassingTest = (line: string) => line.startsWith('(pass) ');
const isFailingTest = (line: string) => line.startsWith('(fail) ');
const isUnhandledError = (line: string) => line.startsWith('# Unhandled error between tests');
const isSummary = (line: string) => /^\d+ tests (failed|skipped):$/.test(line);

const isCoverage = (line: string): string | 'skip' | 'header' | undefined => {
  if (line.match(/^File\s+\|\s+% Funcs\s+\|\s+% Lines\s+\|\s+Uncovered Line #s\s*$/)) {
    return 'header';
  }
  if (
    line.match(/^-*\|-+\|-+\|-+$/) ||
    line.match(/^All files\s+\|\s+\d+\.\d+\s+\|\s+\d+\.\d+\s+\|$/)
  ) {
    return 'skip';
  }

  // src/modules/file-system/MemFileSystem.ts | 96.88 | 91.67 | 135-140,160
  const [_match, file, funcs, lines, uncoveredLines] =
    line.match(/^(\S+)\s+\|\s+(\d+\.\d+)\s+\|\s+(\d+\.\d+)\s+\|\s*([\d\-,]+)?$/) || [];

  if (lines !== undefined && funcs !== undefined) {
    if (uncoveredLines !== undefined) {
      return `${file} [% Lines: ${lines}, Uncovered Line #s: ${uncoveredLines}]`;
    }

    return 'skip';
  }

  return undefined;
};

export function createProxyWriteStream(): Transform {
  const writtenFileStatus = new Set<string>();
  let currentFile: string | undefined = undefined;
  let hasError = false;
  let buffer = '';
  let timeoutId = 0;
  let lastCharWasNewline = false;
  let unhandledError = false;
  let summary = false;
  // Initialize with a no-op function to satisfy TypeScript's "assigned before use" check.
  // The actual stream push function will be assigned in the 'construct' method.
  let proxyWriter: (chunk: any, encoding?: BufferEncoding) => boolean = (_chunk, _encoding) =>
    false;

  const printedLines: string[] = [];

  const write = (val: string) => {
    if (timeoutId !== 0) {
      clearTimeout(timeoutId);
      timeoutId = 0;
    }

    if (!watchMode) {
      timeoutId = setTimeout(() => {
        write('\n\nTimed out waiting for test results\n');
        process.exit(1);
      }, TIMEOUT) as any;
    }

    val.split(NL).forEach((line) => {
      if (line.length > 0) {
        if (printedLines.includes(line)) return;
      }
      if (line.length === 0 && printedLines[printedLines.length - 1] === '') return;
      printedLines.push(line);
      proxyWriter(line + NL);
    });

    return;
    let output = '';
    for (let i = 0; i < val.length; i++) {
      const char = val[i];
      if (char === NL) {
        if (!lastCharWasNewline) {
          output += char;
          lastCharWasNewline = true;
        }
      } else {
        output += char;
        lastCharWasNewline = false;
      }
    }

    process.stdout.write(output);
  };

  const writeFileStatus = () => {
    if (currentFile === undefined) return;
    // write(NL);
    if (writtenFileStatus.has(currentFile)) return;
    writtenFileStatus.add(currentFile);

    if (onlyFailingTests && !hasError) return;

    write((hasError ? FAIL : PASS) + currentFile);
  };

  const processLine = (line: string) => {
    const cleanLine = stripAnsi(line);
    const trimmedLine = cleanLine.trim();
    const filePath = maybeFilePath(trimmedLine);

    const coverage = isCoverage(trimmedLine);
    if (coverage !== undefined) {
      if (coverage === 'skip') {
        summary = true;
        return;
      }
      if (coverage === 'header') {
        write('Coverage Report:');
        return;
      }
      write(coverage);
      return;
    }

    if (isUnhandledError(trimmedLine) && !unhandledError) {
      hasError = true;
      unhandledError = true;
      write(NL + cleanLine);
      write(buffer + NL);

      exitCode = 1;
      buffer = '';
      return;
    }

    if (unhandledError) {
      if (filePath !== undefined) {
        unhandledError = false;
        write(buffer);
        buffer = '';
        return;
      }
    }

    if (summary) {
      write(cleanLine + NL);
      return;
    }

    if (isSummary(trimmedLine)) {
      process.stdout.write(NL);
      currentFile = undefined;
      summary = true;
      return;
    }

    if (filePath !== undefined && currentFile !== filePath) {
      // flush header buffer before any test files are shown
      if (currentFile === undefined && buffer.length > 0) {
        write(buffer.trim() + NL);
      }

      hasError = false;
      buffer = '';
      currentFile = filePath;
      return;
    }

    if (currentFile !== undefined) {
      if (isPassingTest(trimmedLine)) return;

      if (isFailingTest(trimmedLine)) {
        hasError = true;
        writeFileStatus();
        // write('  ' + trimmedLine + NL);
        write(buffer + NL);

        exitCode = 1;
        buffer = '';
        return;
      }
    }

    buffer += line + NL;
  };

  const transformFn = (chunk: string) => {
    const lines = chunk.toString().split(NL);
    lines.forEach(processLine);
  };

  const proxy = new Transform({
    construct(callback) {
      proxyWriter = this.push.bind(this);
      callback();
    },

    transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback) {
      try {
        const input = Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
        transformFn(input); 
        callback(); 
      } catch (err) {
        callback(err as Error);
      }
    },

    final(_callback: TransformCallback) {
      if (currentFile !== undefined && !hasError) {
        writeFileStatus();
      }
      // Ensure a single newline at the end if needed
      if (buffer.trim().length > 0) {
        write(buffer.trim() + NL);
      }
      clearTimeout(timeoutId);
    },
  });

  return proxy;
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const $$ = $({
      env: {
        ...process.env,
        BUN_CORRECT_TEST_COMMAND: '1',
      },
      // cwd: process.cwd(),
    });
    const proc = $$`bun test ${args}`.nothrow();

    // const proc = $$`bun test ${args}`.nothrow().quiet();
    // const transformer = createProxyWriteStream();
    // proc.stderr.pipe(transformer);
    // proc.stdout.pipe(transformer);

    await proc;
    process.exit(exitCode);
  } catch (error: any) {
    console.error(error.stack);
    process.exit(1);
  }
}

main();
