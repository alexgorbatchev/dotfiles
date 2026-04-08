import { EmissionValidationError } from "../errors";
import type { EmissionKind } from "../types";

/** Pattern for valid identifier names (variable, function, alias) */
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Pattern for valid function/alias names (allows hyphens) */
const NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Validates that a string matches the identifier pattern.
 */
export function validateIdentifier(kind: EmissionKind, field: string, value: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new EmissionValidationError(
      kind,
      field,
      `"${value}" is not a valid identifier (must match ${IDENTIFIER_PATTERN.source})`,
    );
  }
}

/**
 * Validates that a string matches the name pattern (allows hyphens).
 */
export function validateName(kind: EmissionKind, field: string, value: string): void {
  if (!NAME_PATTERN.test(value)) {
    throw new EmissionValidationError(
      kind,
      field,
      `"${value}" is not a valid name (must match ${NAME_PATTERN.source})`,
    );
  }
}

/**
 * Validates that a string is non-empty.
 */
export function validateNonEmpty(kind: EmissionKind, field: string, value: string): void {
  if (value.trim().length === 0) {
    throw new EmissionValidationError(kind, field, "cannot be empty");
  }
}

/**
 * Validates that an object has at least one key.
 */
export function validateNonEmptyObject(kind: EmissionKind, field: string, value: Record<string, unknown>): void {
  if (Object.keys(value).length === 0) {
    throw new EmissionValidationError(kind, field, "must have at least one entry");
  }
}

/**
 * Validates environment variable names.
 */
export function validateEnvironmentVariables(variables: Record<string, string>): void {
  validateNonEmptyObject("environment", "variables", variables);
  for (const name of Object.keys(variables)) {
    validateIdentifier("environment", `variables.${name}`, name);
  }
}

/**
 * Validates alias names.
 */
export function validateAliases(aliases: Record<string, string>): void {
  validateNonEmptyObject("alias", "aliases", aliases);
  for (const name of Object.keys(aliases)) {
    validateName("alias", `aliases.${name}`, name);
  }
}
