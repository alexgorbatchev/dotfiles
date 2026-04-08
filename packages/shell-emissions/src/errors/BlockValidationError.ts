/**
 * Error thrown when block validation fails.
 */
export class BlockValidationError extends Error {
  constructor(
    public readonly blockId: string,
    message: string,
  ) {
    super(`Block "${blockId}": ${message}`);
    this.name = "BlockValidationError";
  }
}
