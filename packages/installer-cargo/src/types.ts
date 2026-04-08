import type {
  IInstallContext,
  InstallResultFailure,
  InstallResultSuccess,
  IOperationFailure,
  IOperationSuccess,
} from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

export interface ICargoInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "cargo";
  crateName: string;
  binarySource: string;
  downloadUrl: string;
}

export interface ICargoInstallSuccess extends InstallResultSuccess<ICargoInstallMetadata> {
  binaryPaths: string[];
  version: string;
  originalTag?: string;
  metadata: ICargoInstallMetadata;
}

export type CargoInstallResult = ICargoInstallSuccess | InstallResultFailure;

/**
 * Extended install context with version information for hooks.
 */
export interface ICargoHookContext extends IInstallContext {
  version: string;
}

/**
 * Result of resolving a crate version from various sources.
 */
export interface IVersionResult {
  version: string;
  originalTag?: string;
}

/**
 * Result type for hook execution - either success or failure with error.
 */
export type HookExecutionResult = IOperationSuccess | IOperationFailure;
