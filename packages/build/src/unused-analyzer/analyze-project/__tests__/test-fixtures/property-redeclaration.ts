// Test case for property re-declaration through interface extension

// Source interface with original properties
export interface SourceOptions {
  timeout: number;
  retryCount: number;
  unused: string; // This should be flagged as unused
}

// Interface that re-declares the same properties
export interface ProcessedOptions {
  timeout: number; // Same property, NEW declaration
  retryCount: number; // Same property, NEW declaration
  additionalOption: string;
}

// Type alias with same properties
export type ConfigOptions = {
  timeout: number; // Same property, NEW declaration
  retryCount: number; // Same property, NEW declaration
  configSpecific: boolean;
};

// Usage pattern
export function handler(sourceOpts: SourceOptions): void {
  const processedOpts: ProcessedOptions = {
    ...sourceOpts, // SourceOptions.timeout and retryCount
    additionalOption: 'value',
  };

  // This references ProcessedOptions.timeout, not SourceOptions.timeout
  console.log(processedOpts.timeout);
  console.log(processedOpts.retryCount);
}

export function configHandler(opts: ConfigOptions): void {
  // This uses ConfigOptions.timeout
  console.log(opts.timeout);
  console.log(opts.retryCount);
}
