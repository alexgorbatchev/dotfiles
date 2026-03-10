import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from dmg: toolName=${toolName}`),
  skippingNonMacOS: (toolName: string) =>
    createSafeLogMessage(`Skipping DMG installation for ${toolName}: not running on macOS`),
  downloadingDmg: (url: string) => createSafeLogMessage(`Downloading DMG from: ${url}`),
  mountingDmg: (dmgPath: string) => createSafeLogMessage(`Mounting DMG: ${dmgPath}`),
  dmgMounted: (mountPoint: string) => createSafeLogMessage(`DMG mounted at: ${mountPoint}`),
  copyingApp: (appName: string) => createSafeLogMessage(`Copying app bundle: ${appName}`),
  symlinkingBinary: (from: string, to: string) => createSafeLogMessage(`Symlinking binary: ${from} -> ${to}`),
  unmountingDmg: (mountPoint: string) => createSafeLogMessage(`Unmounting DMG: ${mountPoint}`),
  appNotFound: (mountPoint: string) => createSafeLogMessage(`No .app bundle found in DMG at: ${mountPoint}`),
  extractingArchive: () => createSafeLogMessage('Extracting archive to find DMG'),
  archiveExtracted: (fileCount: number) => createSafeLogMessage(`Archive extracted: ${fileCount} files`),
  dmgFoundInArchive: (dmgFile: string) => createSafeLogMessage(`Found DMG in archive: ${dmgFile}`),
  noDmgInArchive: () => createSafeLogMessage('No .dmg file found in archive'),
} as const satisfies SafeLogMessageMap;
