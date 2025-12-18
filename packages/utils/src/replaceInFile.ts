import { type IFileSystem, NodeFileSystem } from '@dotfiles/file-system';

export type ReplaceInFileMode = 'file' | 'line';

type ReplaceCapture = string | undefined;
type ReplaceGroups = Record<string, string>;

export type ReplaceInFileReplacerResult = string | Promise<string>;
export type ReplaceInFileReplacerFunctionArgs = unknown[];
export type ReplaceInFileReplacerFunction = (
  substring: string,
  ...args: ReplaceInFileReplacerFunctionArgs
) => ReplaceInFileReplacerResult;
export type ReplaceInFileReplacer = string | ReplaceInFileReplacerFunction;

export interface IReplaceInFileOptions {
  /** Optional. Defaults to `new NodeFileSystem()` when not provided. */
  fileSystem?: IFileSystem;
  filePath: string;
  from: RegExp;
  to: ReplaceInFileReplacer;
  mode: ReplaceInFileMode;
}

/**
 * Performs a regex-based replacement within a file.
 *
 * This utility is designed for code-mod style operations where the replacement value may be
 * computed asynchronously.
 *
 * **Key behaviors**
 * - Always replaces *all* matches (global replacement), even if `from` does not include the `g` flag.
 * - Supports `to` as either a string or a (a)sync callback.
 * - Supports `mode: 'file'` (process the whole file as one string) and `mode: 'line'` (process each
 *   line separately, preserving the original end-of-line sequences encountered in the file).
 * - No-op write: if the computed output is identical to the input content, the file is not written.
 *
 * **Replacement callback arguments**
 *
 * When `to` is a function, it is called in a way that mirrors `String.prototype.replace` callback
 * semantics for regular expressions:
 * - First argument is the matched substring.
 * - Followed by all capture groups (which may be `undefined`).
 * - Followed by the match offset (number).
 * - Followed by the original input string.
 * - If named capture groups are present, a final groups object is provided.
 *
 * @example
 * ```ts
 * await replaceInFile({
 *   fileSystem,
 *   filePath: '/tmp/input.txt',
 *   mode: 'file',
 *   from: /foo/,
 *   to: 'bar',
 * });
 * ```
 */
export async function replaceInFile(options: IReplaceInFileOptions): Promise<void> {
  const fileSystem: IFileSystem = options.fileSystem ?? new NodeFileSystem();

  const content = await fileSystem.readFile(options.filePath, 'utf8');

  const finalContent: string =
    options.mode === 'line'
      ? await replaceInLines(content, options.from, options.to)
      : await replaceInString(content, options.from, options.to);

  if (finalContent === content) {
    return;
  }

  await fileSystem.writeFile(options.filePath, finalContent, 'utf8');
}

function ensureGlobalRegExp(pattern: RegExp): RegExp {
  const flags: string = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern: RegExp = new RegExp(pattern.source, flags);
  return globalPattern;
}

async function resolveReplacement(
  to: ReplaceInFileReplacer,
  substring: string,
  args: ReplaceInFileReplacerFunctionArgs
): Promise<string> {
  if (typeof to === 'string') {
    const result: string = to;
    return result;
  }

  const replacementOrPromise: ReplaceInFileReplacerResult = to(substring, ...args);
  const result: string = await replacementOrPromise;
  return result;
}

async function replaceInString(input: string, from: RegExp, to: ReplaceInFileReplacer): Promise<string> {
  const pattern: RegExp = ensureGlobalRegExp(from);
  const matches: RegExpMatchArray[] = Array.from(input.matchAll(pattern));

  let result: string = input;
  let offset: number = 0;

  for (const match of matches) {
    const substring: string = match[0] ?? '';
    const index: number = match.index ?? 0;

    const captures: ReplaceCapture[] = match.slice(1);
    const callbackArgs: ReplaceInFileReplacerFunctionArgs = [...captures, index, input];

    const groups: ReplaceGroups | undefined = match.groups;
    if (groups) {
      callbackArgs.push(groups);
    }

    const replacement: string = await resolveReplacement(to, substring, callbackArgs);
    const start: number = index + offset;
    const end: number = start + substring.length;

    result = result.slice(0, start) + replacement + result.slice(end);
    offset += replacement.length - substring.length;
  }

  return result;
}

async function replaceInLines(content: string, from: RegExp, to: ReplaceInFileReplacer): Promise<string> {
  const parts: string[] = content.split(/(\r\n|\n)/);

  let result: string = '';

  for (let index = 0; index < parts.length; index += 2) {
    const line: string = parts[index] ?? '';
    const eol: string = parts[index + 1] ?? '';

    const replacedLine: string = await replaceInString(line, from, to);
    result += replacedLine + eol;
  }

  return result;
}
