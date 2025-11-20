declare namespace NodeJS {
  interface IProcessEnvOverrides {
    DOTFILES_VERSION: string;
  }

  interface ProcessEnv extends IProcessEnvOverrides {}
}
