import { describe, expect, test } from 'bun:test';
import { getBuiltPackageName, type IBuiltPackageEnvironment } from '../getBuiltPackageName';

describe('getBuiltPackageName', () => {
  test('returns default package name when environment variable is not set', () => {
    const env: IBuiltPackageEnvironment = {};

    const packageName: string = getBuiltPackageName(env);

    expect(packageName).toBe('@alexgorbatchev/dotfiles');
  });

  test('returns configured package name when environment variable is set', () => {
    const env: IBuiltPackageEnvironment = {
      DOTFILES_BUILT_PACKAGE_NAME: '@dotfiles/core',
    };

    const packageName: string = getBuiltPackageName(env);

    expect(packageName).toBe('@dotfiles/core');
  });

  test('falls back to default when environment variable is empty', () => {
    const env: IBuiltPackageEnvironment = {
      DOTFILES_BUILT_PACKAGE_NAME: '   ',
    };

    const packageName: string = getBuiltPackageName(env);

    expect(packageName).toBe('@alexgorbatchev/dotfiles');
  });
});
