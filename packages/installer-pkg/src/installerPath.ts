const DEFAULT_INSTALLER_PATH = "/usr/sbin/installer";
const INSTALLER_PATH_ENV_VAR = "DOTFILES_TEST_PKG_INSTALLER_PATH";
const ALLOW_NON_MACOS_ENV_VAR = "DOTFILES_TEST_PKG_ALLOW_NON_MACOS";

/**
 * Test seam for e2e coverage. Production continues to use the system installer
 * unless a caller explicitly overrides it in the process environment.
 */
export function getPkgInstallerPath(env: NodeJS.ProcessEnv = process.env): string {
  return env[INSTALLER_PATH_ENV_VAR] || DEFAULT_INSTALLER_PATH;
}

export function shouldAllowNonMacOSPkgInstall(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ALLOW_NON_MACOS_ENV_VAR] === "1";
}

export { ALLOW_NON_MACOS_ENV_VAR, DEFAULT_INSTALLER_PATH, INSTALLER_PATH_ENV_VAR };
