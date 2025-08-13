/**
 * Defines the types of shells for which command-line completions can be configured and installed.
 */
export type ShellType =
  /** Zsh (Z Shell) */
  | 'zsh'
  /** Bash (Bourne Again SHell) */
  | 'bash'
  /** PowerShell (Windows PowerShell and PowerShell Core) */
  | 'powershell';
