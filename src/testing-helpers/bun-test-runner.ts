/**
 * This script shortens the `bun test` output by only showing passing files and the failing
 * tests details instead of the full output to save on token usage. A few more things could
 * have been cut, but the output is also ideally human readable.
 */
import * as fs from 'fs';
import { Transform, type TransformCallback } from 'stream';
import stripAnsi from 'strip-ansi';
import { $ } from 'zx';

function isFilePath(line: string): string | undefined {
  if (!line.endsWith(':')) return undefined;
  const filePath = line.slice(0, -1);
  if (!fs.existsSync(filePath)) return undefined;
  return filePath;
}

const TIMEOUT = 10000;
const PASS = 'PASS: ';
const FAIL = 'FAIL: ';
const NL = '\n';

const isPassingTest = (line: string) => line.startsWith('(pass) ');
const isFailingTest = (line: string) => line.startsWith('(fail) ');
const isSummary = (line: string) => /^\d+ tests failed:$/.test(line);

let exitCode = 0;

function createProxyWriteStream(): Transform {
  let currentFile: string | undefined = undefined;
  let hasError = false;
  let buffer = '';
  const writtenFileStatus = new Set<string>();
  let timeoutId = 0;
  let lastCharWasNewline = false;

  const write = (val: string) => {
    if (timeoutId !== 0) {
      clearTimeout(timeoutId);
      timeoutId = 0;
    }

    timeoutId = setTimeout(() => {
      write('\n\nTimed out waiting for test results\n');
      process.exit(1);
    }, TIMEOUT) as any;

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

  const onlyFailingTests = true;

  const writeFileStatus = () => {
    if (currentFile === undefined) return;
    write(NL);
    if (writtenFileStatus.has(currentFile)) return;
    writtenFileStatus.add(currentFile);

    if (onlyFailingTests && !hasError) return;

    write(hasError ? FAIL : PASS);
    write(currentFile + NL);
  };

  const processLine = (line: string) => {
    const cleanLine = stripAnsi(line).trim();
    const filePath = isFilePath(cleanLine);

    if (isSummary(cleanLine)) {
      process.stdout.write(NL);
      currentFile = undefined;
    }

    if (filePath !== undefined && currentFile !== filePath) {
      // writing this for previous file
      if (currentFile !== undefined && !hasError) {
        writeFileStatus();
      }

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
      if (isPassingTest(cleanLine)) return;

      if (isFailingTest(cleanLine)) {
        hasError = true;
        writeFileStatus();
        write('  ' + cleanLine + NL);
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
    transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback) {
      try {
        const input = Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
        transformFn(input);
        callback(null, Buffer.from(''));
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
        // Removed lastCharWasNewline check here
        write(buffer.trim() + NL); // Added NL here
      }
      clearTimeout(timeoutId);
    },
  });

  return proxy;
}

async function main() {
  try {
    // console.log(process.argv);
    // process.exit(0)
    const args = process.argv.slice(2);
    const $$ = $({
      env: {
        ...process.env,
        BUN_CORRECT_TEST_COMMAND: '1',
      },
      cwd: process.cwd(),
    });
    const proc = $$`bun test ${args}`.nothrow().quiet();
    const transformer = createProxyWriteStream();

    proc.stderr.pipe(transformer);
    proc.stdout.pipe(transformer);

    await proc;
    process.exit(exitCode);
  } catch (error: any) {
    console.error(error.stack);
    process.exit(1);
  }
}

main();
