import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { Resolvable } from '@dotfiles/unwrap-value';
import { resolveValue } from '@dotfiles/unwrap-value';

export type ReplaceInFileMode = 'file' | 'line';

type ReplaceCapture = string | undefined;
type ReplaceGroups = Record<string, string>;

export interface IReplaceInFileMatch {
  substring: string;
  captures: ReplaceCapture[];
  offset: number;
  input: string;
  groups?: ReplaceGroups;
}

export type ReplaceInFileReplacer = Resolvable<IReplaceInFileMatch, string>;
export type ReplaceInFilePattern = RegExp | string;

export interface IReplaceInFileOptions {
  /** Optional. Defaults to `'file'` when not provided. */
  mode?: ReplaceInFileMode;
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
 * - Supports `mode: 'file'` (default, process the whole file as one string) and `mode: 'line'`
 *   (process each line separately, preserving the original end-of-line sequences encountered in the file).
 * - No-op write: if the computed output is identical to the input content, the file is not written.
 * - Returns `true` if replacements were made, `false` otherwise.
 *
 * **Replacement callback arguments**
 *
 * When `to` is a function, it receives an `IReplaceInFileMatch` object:
 * - `substring`: the matched substring
 * - `captures`: array of capture groups (which may be `undefined`)
 * - `offset`: the match offset (number)
 * - `input`: the original input string
 * - `groups`: named capture groups object (if present)
 *
 * @returns `true` if any replacements were made, `false` if no matches were found.
 *
 * @example
 * ```ts
 * const wasReplaced = await replaceInFile(fileSystem, '/tmp/input.txt', /foo/, 'bar');
 * if (!wasReplaced) {
 *   console.log('Pattern not found');
 * }
 * ```
 *
 * @example
 * ```ts
 * await replaceInFile(fileSystem, '~/config.txt', 'foo', 'bar', { mode: 'line' });
 * ```
 */
export async function replaceInFile(
  fileSystem: IResolvedFileSystem,
  filePath: string,
  from: ReplaceInFilePattern,
  to: ReplaceInFileReplacer,
  options?: IReplaceInFileOptions
): Promise<boolean> {
  const mode: ReplaceInFileMode = options?.mode ?? 'file';
  const pattern: RegExp = normalizePattern(from);

  const content = await fileSystem.readFile(filePath, 'utf8');

  const finalContent: string =
    mode === 'line' ? await replaceInLines(content, pattern, to) : await replaceInString(content, pattern, to);

  const wasReplaced: boolean = finalContent !== content;

  if (wasReplaced) {
    await fileSystem.writeFile(filePath, finalContent, 'utf8');
  }

  return wasReplaced;
}

function normalizePattern(from: ReplaceInFilePattern): RegExp {
  if (typeof from === 'string') {
    const escaped: string = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern: RegExp = new RegExp(escaped, 'g');
    return pattern;
  }

  const flags: string = from.flags.includes('g') ? from.flags : `${from.flags}g`;
  const pattern: RegExp = new RegExp(from.source, flags);
  return pattern;
}

async function replaceInString(input: string, pattern: RegExp, to: ReplaceInFileReplacer): Promise<string> {
  const matches: RegExpMatchArray[] = Array.from(input.matchAll(pattern));

  let result: string = input;
  let offset: number = 0;

  for (const match of matches) {
    const substring: string = match[0] ?? '';
    const index: number = match.index ?? 0;
    const captures: ReplaceCapture[] = match.slice(1);
    const groups: ReplaceGroups | undefined = match.groups;

    const matchParams: IReplaceInFileMatch = {
      substring,
      captures,
      offset: index,
      input,
      groups,
    };

    const replacement: string = await resolveValue(matchParams, to);
    const start: number = index + offset;
    const end: number = start + substring.length;

    result = result.slice(0, start) + replacement + result.slice(end);
    offset += replacement.length - substring.length;
  }

  return result;
}

async function replaceInLines(content: string, pattern: RegExp, to: ReplaceInFileReplacer): Promise<string> {
  const parts: string[] = content.split(/(\r\n|\n)/);

  let result: string = '';

  for (let index = 0; index < parts.length; index += 2) {
    const line: string = parts[index] ?? '';
    const eol: string = parts[index + 1] ?? '';

    const replacedLine: string = await replaceInString(line, pattern, to);
    result += replacedLine + eol;
  }

  return result;
}
