export interface ToolInstallation {
  id: number;
  toolName: string;
  version: string;
  installPath: string;
  timestamp: string;
  installedAt: number;
  binaryPaths: string[];
  downloadUrl?: string;
  assetName?: string;
  configuredVersion?: string;
}

export type ToolInstallationInput = Omit<ToolInstallation, 'id' | 'installedAt'>;
