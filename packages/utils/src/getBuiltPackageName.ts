const DEFAULT_BUILT_PACKAGE_NAME = '@alexgorbatchev/dotfiles';

declare global {
  namespace NodeJS {
    interface IProcessEnvOverrides {
      DOTFILES_BUILT_PACKAGE_NAME?: string;
    }

    interface ProcessEnv extends IProcessEnvOverrides {}
  }
}

export interface IBuiltPackageEnvironment {
  DOTFILES_BUILT_PACKAGE_NAME?: string;
}

/**
 * We intentionally augment ProcessEnv via IProcessEnvOverrides so the bundler can statically replace
 * process.env.DOTFILES_BUILT_PACKAGE_NAME with its configured value.
 * Using bracket notation prevents this optimization and breaks the build output.
 */
export function getBuiltPackageName(env?: IBuiltPackageEnvironment): string {
  const configuredName: string | undefined = env?.DOTFILES_BUILT_PACKAGE_NAME ??
    process.env.DOTFILES_BUILT_PACKAGE_NAME;

  if (configuredName !== undefined) {
    const trimmedName: string = configuredName.trim();

    if (trimmedName !== '') {
      return trimmedName;
    }
  }

  return DEFAULT_BUILT_PACKAGE_NAME;
}
