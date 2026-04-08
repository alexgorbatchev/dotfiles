import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  configurationProcessing: () => createSafeLogMessage("config processing"),
  platformOverrides: (platform: string, arch: string) =>
    createSafeLogMessage(`platform overrides: ${platform} ${arch}`),
  configurationValidationFailed: (errors: string[]) =>
    createSafeLogMessage(`Configuration validation failed:\n${errors.join("\n")}`),
  configurationParseError: (configPath: string, format: string, reason: string) =>
    createSafeLogMessage(`Failed to parse ${format} configuration ${configPath}: ${reason}`),
  configurationLoadFailed: (toolPath: string) => createSafeLogMessage(`Failed to load configuration: ${toolPath}`),
  configurationLoaded: (configPath: string, toolCount: number) =>
    createSafeLogMessage(`Configuration loaded from ${configPath} (${toolCount} tools configured)`),
  toolConfigLoadingStarted: (toolConfigsDir: string) => createSafeLogMessage(`tool config loading: ${toolConfigsDir}`),
  singleToolConfigLoadingStarted: (toolName: string, toolConfigsDir: string) =>
    createSafeLogMessage(`single tool config load: ${toolName} in ${toolConfigsDir}`),
  toolConfigDirectoryScan: (toolConfigsDir: string) => createSafeLogMessage(`Directory scan: ${toolConfigsDir}`),
  toolConfigLoadingCompleted: () => createSafeLogMessage("tool config loading completed"),
  configurationFieldInvalid: (field: string, value: string, expected: string) =>
    createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
  fsItemNotFound: (itemType: string, path: string) => createSafeLogMessage(`${itemType} not found: ${path}`),
  fsReadFailed: (path: string) => createSafeLogMessage(`Failed to read ${path}`),
  loadingTypeScriptConfiguration: () => createSafeLogMessage("Loading TypeScript configuration"),
  binarySearchStarted: (binaryName: string, toolConfigsDir: string) =>
    createSafeLogMessage(`Searching for tool providing binary '${binaryName}' in ${toolConfigsDir}`),
  binaryNotFound: (binaryName: string) => createSafeLogMessage(`No tool provides binary '${binaryName}'`),
  binaryFoundInTool: (binaryName: string, toolName: string) =>
    createSafeLogMessage(`Binary '${binaryName}' is provided by tool '${toolName}'`),
  multipleBinaryProviders: (binaryName: string, toolNames: string[]) =>
    createSafeLogMessage(`Multiple tools provide binary '${binaryName}': ${toolNames.join(", ")}`),
} satisfies SafeLogMessageMap;
