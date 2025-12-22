import { expect, test } from 'bun:test';

import type { IBaseToolContext } from '../index';

type AssertKeyAbsent<TType, TKey extends PropertyKey> = TKey extends keyof TType ? never : true;
type AssertKeyPresent<TType, TKey extends PropertyKey> = TKey extends keyof TType ? true : never;

const assertNoHomeDirInBaseToolContext: AssertKeyAbsent<IBaseToolContext, 'homeDir'> = true;
const assertNoBinDirInBaseToolContext: AssertKeyAbsent<IBaseToolContext, 'binDir'> = true;
const assertNoShellScriptsDirInBaseToolContext: AssertKeyAbsent<IBaseToolContext, 'shellScriptsDir'> = true;
const assertNoDotfilesDirInBaseToolContext: AssertKeyAbsent<IBaseToolContext, 'dotfilesDir'> = true;
const assertNoGeneratedDirInBaseToolContext: AssertKeyAbsent<IBaseToolContext, 'generatedDir'> = true;

const assertHasToolDirInBaseToolContext: AssertKeyPresent<IBaseToolContext, 'toolDir'> = true;
const assertHasCurrentDirInBaseToolContext: AssertKeyPresent<IBaseToolContext, 'currentDir'> = true;

test('IBaseToolContext type-only assertions compile', () => {
  expect(assertNoHomeDirInBaseToolContext).toBe(true);
  expect(assertNoBinDirInBaseToolContext).toBe(true);
  expect(assertNoShellScriptsDirInBaseToolContext).toBe(true);
  expect(assertNoDotfilesDirInBaseToolContext).toBe(true);
  expect(assertNoGeneratedDirInBaseToolContext).toBe(true);
  expect(assertHasToolDirInBaseToolContext).toBe(true);
  expect(assertHasCurrentDirInBaseToolContext).toBe(true);
  expect(true).toBe(true);
});
