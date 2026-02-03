import type { Emission } from '../types';

/**
 * Error thrown when rendering fails.
 * Intended for formatter implementations to throw when they
 * encounter an emission they cannot render.
 */
export class RenderError extends Error {
  constructor(
    public readonly emission: Emission,
    message: string,
  ) {
    super(`Render error for ${emission.kind}: ${message}`);
    this.name = 'RenderError';
  }
}
