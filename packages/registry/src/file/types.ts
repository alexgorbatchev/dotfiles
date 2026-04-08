export interface IFileRegistryValidationResult {
  valid: boolean;
  issues: string[];
  repaired: string[];
}

export interface IFileRegistryStats {
  totalOperations: number;
  totalFiles: number;
  totalTools: number;
  oldestOperation: number;
  newestOperation: number;
}
