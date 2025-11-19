const DEFAULT_BUILT_PACKAGE_NAME = '@gitea/dotfiles';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DOTFILES_BUILT_PACKAGE_NAME?: string;
    }
  }
}

export interface BuiltPackageEnvironment {
  DOTFILES_BUILT_PACKAGE_NAME?: string;
}

/**
 * We intentionally augment ProcessEnv so the bundler can statically replace
 * process.env.DOTFILES_BUILT_PACKAGE_NAME with its configured value.
 * Using bracket notation prevents this optimization and breaks the build output.
 */
export function getBuiltPackageName(env?: BuiltPackageEnvironment): string {
  const configuredName: string | undefined = env?.DOTFILES_BUILT_PACKAGE_NAME ?? process.env.DOTFILES_BUILT_PACKAGE_NAME;

  if (configuredName !== undefined) {
    const trimmedName: string = configuredName.trim();

    if (trimmedName !== '') {
      return trimmedName;
    }
  }

  return DEFAULT_BUILT_PACKAGE_NAME;
}
