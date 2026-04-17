import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from pkg: toolName=${toolName}`),
  skippingNonMacOS: (toolName: string) =>
    createSafeLogMessage(`Skipping PKG installation for ${toolName}: not running on macOS`),
  downloadingPkg: (url: string) => createSafeLogMessage(`Downloading PKG from: ${url}`),
  extractingArchive: () => createSafeLogMessage("Extracting archive to find PKG"),
  archiveExtracted: (fileCount: number) => createSafeLogMessage(`Archive extracted: ${fileCount} files`),
  pkgFoundInArchive: (pkgFile: string) => createSafeLogMessage(`Found PKG in archive: ${pkgFile}`),
  noPkgInArchive: () => createSafeLogMessage("No .pkg file found in archive"),
  runningInstaller: (pkgPath: string, target: string) =>
    createSafeLogMessage(`Running macOS installer for ${pkgPath} targeting ${target}`),
  resolvingBinary: (binaryName: string) => createSafeLogMessage(`Resolving installed binary from PATH: ${binaryName}`),
  binaryNotFound: (binaryName: string) =>
    createSafeLogMessage(`Installed package did not expose expected binary on PATH: ${binaryName}`),
} as const satisfies SafeLogMessageMap;
