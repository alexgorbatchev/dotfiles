import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs'; // Using synchronous fs for simplicity at startup

export interface Config {
  TARGET_DIR: string;
  DOTFILES_DIR: string;
  GENERATED_DIR: string;
  DEBUG: string;
  CACHE_ENABLED: boolean;
  SUDO_PROMPT: string;
  // Derived paths
  CACHE_PATH: string;
  BINARIES_PATH: string;
  BIN_PATH: string;
  ZSH_GENERATED_PATH: string;
  MANIFEST_PATH: string;
  GITHUB_TOKEN?: string; // Optional GitHub token
}

// Helper to parse boolean from string
const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value === null || value.trim() === '') {
    return defaultValue;
  }
  const lowerValue = value.toLowerCase();
  if (lowerValue === 'true' || lowerValue === '1') {
    return true;
  }
  if (lowerValue === 'false' || lowerValue === '0') {
    return false;
  }
  return defaultValue; // Fallback to default if ambiguous
};

// Singleton config instance
let currentConfig: Config | null = null;

/**
 * Loads configuration from .env file and environment variables.
 * Prioritizes process.env > .env file > defaults.
 * @param dotfilesRoot The absolute path to the root of the dotfiles directory.
 *                     This is used to locate the .env file and as a default for DOTFILES_DIR.
 * @returns The loaded configuration object.
 */
export function loadConfig(dotfilesRoot: string): Config {
  if (currentConfig) {
    // TODO: Potentially add a way to force reload if needed for testing or dynamic changes,
    // but for general use, loading once is fine.
    // For tests, ensure `currentConfig` is reset or `loadConfig` is called with a unique `dotfilesRoot`
    // if the underlying .env or process.env changes between test cases.
    // The test setup currently handles this by modifying .env and process.env then calling loadConfig.
  }

  const envPath = path.join(dotfilesRoot, '.env');
  let envFileValues: dotenv.DotenvParseOutput = {};
  if (fs.existsSync(envPath)) {
    envFileValues = dotenv.parse(fs.readFileSync(envPath, { encoding: 'utf8' }));
  }
  // Also, ensure dotenv.config() is called to load into process.env if needed by other parts of dotenv or libraries
  // However, we are manually giving process.env precedence.
  // dotenv.config({ path: envPath }); // This loads into process.env, which we might not want if we handle precedence manually.

  // Determine DOTFILES_DIR: process.env > auto-detected dotfilesRoot > .env file
  const DOTFILES_DIR = process.env.DOTFILES_DIR || dotfilesRoot || envFileValues.DOTFILES_DIR || '';
  // If dotfilesRoot itself is somehow invalid/empty, default to CWD as a last resort? Or throw error?
  // For now, assume dotfilesRoot passed to loadConfig is valid.

  // Determine GENERATED_DIR: process.env > .env file > derived from DOTFILES_DIR
  const envGeneratedDir = process.env.GENERATED_DIR || envFileValues.GENERATED_DIR || '';
  const GENERATED_DIR = envGeneratedDir || path.join(DOTFILES_DIR, '.generated');

  // Load other values with priorities: process.env > .env file > default
  const TARGET_DIR = process.env.TARGET_DIR || envFileValues.TARGET_DIR || '/usr/bin';
  const DEBUG_ENV = process.env.DEBUG || envFileValues.DEBUG || ''; // Renamed to avoid conflict with imported debug
  const CACHE_ENABLED_STR = process.env.CACHE_ENABLED || envFileValues.CACHE_ENABLED;
  const CACHE_ENABLED = parseBoolean(CACHE_ENABLED_STR, true); // Default true
  const SUDO_PROMPT = process.env.SUDO_PROMPT || envFileValues.SUDO_PROMPT || '';
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN || envFileValues.GITHUB_TOKEN;

  currentConfig = {
    TARGET_DIR,
    DOTFILES_DIR,
    GENERATED_DIR,
    DEBUG: DEBUG_ENV, // Use the renamed variable
    CACHE_ENABLED,
    SUDO_PROMPT,
    CACHE_PATH: path.join(GENERATED_DIR, 'cache'),
    // Removed duplicate lines below
    BINARIES_PATH: path.join(GENERATED_DIR, 'binaries'),
    BIN_PATH: path.join(GENERATED_DIR, 'bin'),
    ZSH_GENERATED_PATH: path.join(GENERATED_DIR, 'zsh'),
    MANIFEST_PATH: path.join(GENERATED_DIR, 'manifest.json'),
    GITHUB_TOKEN: GITHUB_TOKEN || undefined, // Ensure it's undefined if empty
  };

  // Set DEBUG environment variable if not already set by process.env
  // This makes the debug logs work based on .env file configuration as well.
  if (process.env.DEBUG === undefined && currentConfig.DEBUG) {
    process.env.DEBUG = currentConfig.DEBUG;
  }
  // Re-initialize debug instances if DEBUG env var changed
  // This is tricky as debug instances cache the enabled state.
  // For simplicity, we assume DEBUG is set before any loggers are created or used extensively.
  // Or, users can set DEBUG via process.env directly for immediate effect.

  return currentConfig;
}

/**
 * Gets the current configuration. Loads it if it hasn't been loaded yet.
 * Assumes that the CWD is the dotfiles root if called before explicit loadConfig.
 * @returns The configuration object.
 */
export function getConfig(): Config {
  if (!currentConfig) {
    // If getConfig is called before loadConfig, load with CWD as dotfilesRoot.
    // This is a convenience for modules that just need to import and use the config.
    return loadConfig(process.cwd());
  }
  return currentConfig;
}

// Export a pre-loaded config instance for easy import by other modules.
// This assumes that when this module is first imported, CWD is the dotfiles root.
// If used in contexts where CWD might not be the dotfiles root,
// `loadConfig(actualDotfilesRoot)` should be called explicitly first.
export const config: Config = getConfig();
