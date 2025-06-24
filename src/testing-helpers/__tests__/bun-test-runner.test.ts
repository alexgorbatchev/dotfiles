import stripAnsi from 'strip-ansi';
import { describe, expect, test } from 'bun:test';
import { createReadStream } from 'node:fs';
import { Readable } from 'stream';
import { createProxyWriteStream } from '../bun-test-runner';

function streamLines(fixtureName: string): Readable {
  const stream = createReadStream(`${__dirname}/fixtures/bun-test-runner--${fixtureName}.txt`, {
    encoding: 'utf-8',
  });
  return stream;
}

function run(fixtureName: string, cb: (results: string) => void) {
  const stream = streamLines(fixtureName);
  const transformer = createProxyWriteStream();
  let content = '';
  stream.pipe(transformer).on('data', (chunk) => {
    content += chunk;
  });
  stream.on('end', () => {
    cb(stripAnsi(content));
  });
}

describe('bun-test-runner', () => {
  [
    'no-errors',
    'no-errors--one-skipped',
    'same-file--one-failing',
    'same-file--one-failing-with-unhandled-error',
    'same-file--two-failing',
    'two-files--two-failing',
  ].forEach((fixiture) => {
    test(fixiture, (done) => {
      run(fixiture, (results) => {
        expect(results).toMatchSnapshot();
        done();
      });
    });
  });
});
