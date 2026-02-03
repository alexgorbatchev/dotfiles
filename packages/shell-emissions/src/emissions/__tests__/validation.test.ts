import { describe, expect, it } from 'bun:test';
import { EmissionValidationError } from '../../errors';
import {
  validateAliases,
  validateEnvironmentVariables,
  validateIdentifier,
  validateName,
  validateNonEmpty,
  validateNonEmptyObject,
} from '../validation';

describe('validation', () => {
  describe('validateIdentifier', () => {
    it('should accept valid identifiers', () => {
      expect(() => validateIdentifier('environment', 'name', 'MY_VAR')).not.toThrow();
      expect(() => validateIdentifier('environment', 'name', '_private')).not.toThrow();
      expect(() => validateIdentifier('environment', 'name', 'var123')).not.toThrow();
      expect(() => validateIdentifier('environment', 'name', 'a')).not.toThrow();
    });

    it('should reject identifiers starting with numbers', () => {
      expect(() => validateIdentifier('environment', 'name', '123var')).toThrow(
        EmissionValidationError,
      );
    });

    it('should reject identifiers with hyphens', () => {
      expect(() => validateIdentifier('environment', 'name', 'my-var')).toThrow(
        EmissionValidationError,
      );
    });

    it('should reject empty identifiers', () => {
      expect(() => validateIdentifier('environment', 'name', '')).toThrow(EmissionValidationError);
    });

    it('should reject identifiers with special characters', () => {
      expect(() => validateIdentifier('environment', 'name', 'var$name')).toThrow(
        EmissionValidationError,
      );
    });
  });

  describe('validateName', () => {
    it('should accept valid names including hyphens', () => {
      expect(() => validateName('function', 'name', 'my_func')).not.toThrow();
      expect(() => validateName('function', 'name', 'my-func')).not.toThrow();
      expect(() => validateName('function', 'name', '_private')).not.toThrow();
      expect(() => validateName('alias', 'name', 'my-alias')).not.toThrow();
    });

    it('should reject names starting with numbers', () => {
      expect(() => validateName('function', 'name', '123func')).toThrow(EmissionValidationError);
    });

    it('should reject empty names', () => {
      expect(() => validateName('function', 'name', '')).toThrow(EmissionValidationError);
    });

    it('should reject names with special characters', () => {
      expect(() => validateName('function', 'name', 'func$name')).toThrow(EmissionValidationError);
    });
  });

  describe('validateNonEmpty', () => {
    it('should accept non-empty strings', () => {
      expect(() => validateNonEmpty('script', 'content', 'echo hello')).not.toThrow();
      expect(() => validateNonEmpty('script', 'content', '  content  ')).not.toThrow();
    });

    it('should reject empty strings', () => {
      expect(() => validateNonEmpty('script', 'content', '')).toThrow(EmissionValidationError);
    });

    it('should reject whitespace-only strings', () => {
      expect(() => validateNonEmpty('script', 'content', '   ')).toThrow(EmissionValidationError);
      expect(() => validateNonEmpty('script', 'content', '\t\n')).toThrow(EmissionValidationError);
    });
  });

  describe('validateNonEmptyObject', () => {
    it('should accept objects with entries', () => {
      expect(() => validateNonEmptyObject('environment', 'variables', { KEY: 'value' })).not.toThrow();
    });

    it('should reject empty objects', () => {
      expect(() => validateNonEmptyObject('environment', 'variables', {})).toThrow(
        EmissionValidationError,
      );
    });
  });

  describe('validateEnvironmentVariables', () => {
    it('should accept valid environment variables', () => {
      expect(() => validateEnvironmentVariables({ MY_VAR: 'value', OTHER: 'val' })).not.toThrow();
    });

    it('should reject empty object', () => {
      expect(() => validateEnvironmentVariables({})).toThrow(EmissionValidationError);
    });

    it('should reject invalid variable names', () => {
      expect(() => validateEnvironmentVariables({ 'invalid-name': 'value' })).toThrow(
        EmissionValidationError,
      );
    });
  });

  describe('validateAliases', () => {
    it('should accept valid alias names including hyphens', () => {
      expect(() => validateAliases({ ll: 'ls -la', 'git-st': 'git status' })).not.toThrow();
    });

    it('should reject empty object', () => {
      expect(() => validateAliases({})).toThrow(EmissionValidationError);
    });

    it('should reject invalid alias names', () => {
      expect(() => validateAliases({ '123alias': 'command' })).toThrow(EmissionValidationError);
    });
  });
});
