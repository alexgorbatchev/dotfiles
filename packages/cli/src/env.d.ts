declare const DOTFILES_VERSION: string;
declare const DOTFILES_COMPILED_AUTHORING_TYPES: string | undefined;

declare namespace NodeJS {
  interface IProcessEnvOverrides {
    DOTFILES_VERSION: string;
  }

  interface ProcessEnv extends IProcessEnvOverrides {}
}
