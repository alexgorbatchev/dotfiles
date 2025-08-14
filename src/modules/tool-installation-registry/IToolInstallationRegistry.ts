import type { ToolInstallation, ToolInstallationInput } from './types';

export interface IToolInstallationRegistry {
  recordToolInstallation(installation: ToolInstallationInput): Promise<void>;
  getToolInstallation(toolName: string): Promise<ToolInstallation | null>;
  getAllToolInstallations(): Promise<ToolInstallation[]>;
  updateToolInstallation(toolName: string, updates: Partial<ToolInstallation>): Promise<void>;
  removeToolInstallation(toolName: string): Promise<void>;
  isToolInstalled(toolName: string, version?: string): Promise<boolean>;
  close(): Promise<void>;
}
