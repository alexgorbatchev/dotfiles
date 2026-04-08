import type { EmissionKind } from "../types";

/**
 * Error thrown when emission validation fails.
 */
export class EmissionValidationError extends Error {
  constructor(
    public readonly emissionKind: EmissionKind,
    public readonly field: string,
    message: string,
  ) {
    super(`${emissionKind}.${field}: ${message}`);
    this.name = "EmissionValidationError";
  }
}
