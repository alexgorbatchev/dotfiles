export interface IDistCheckPackageJson {
  name: string;
  private: true;
  dependencies: Record<string, string>;
}

export function createDistCheckPackageJson(): IDistCheckPackageJson {
  const dependencies: Record<string, string> = {
    '@gitea/dotfiles': 'file:../../.dist',
  };

  const packageJson: IDistCheckPackageJson = {
    name: 'dist-check',
    private: true,
    dependencies,
  };

  return packageJson;
}
