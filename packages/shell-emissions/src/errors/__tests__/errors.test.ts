import { describe, expect, it } from 'bun:test';
import { environment } from '../../emissions/factories';
import { BlockValidationError, EmissionValidationError, RenderError } from '..';

describe('EmissionValidationError', () => {
  it('creates error with correct properties', () => {
    const error = new EmissionValidationError('function', 'name', 'invalid identifier');

    expect(error.name).toMatchInlineSnapshot(`"EmissionValidationError"`);
    expect(error.message).toMatchInlineSnapshot(`"function.name: invalid identifier"`);
    expect(error.emissionKind).toMatchInlineSnapshot(`"function"`);
    expect(error.field).toMatchInlineSnapshot(`"name"`);
  });

  it('is instanceof Error', () => {
    const error = new EmissionValidationError('alias', 'aliases', 'test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof EmissionValidationError).toBe(true);
  });
});

describe('BlockValidationError', () => {
  it('creates error with correct properties', () => {
    const error = new BlockValidationError('my-block', 'duplicate section');

    expect(error.name).toMatchInlineSnapshot(`"BlockValidationError"`);
    expect(error.message).toMatchInlineSnapshot(`"Block "my-block": duplicate section"`);
    expect(error.blockId).toMatchInlineSnapshot(`"my-block"`);
  });

  it('is instanceof Error', () => {
    const error = new BlockValidationError('test', 'test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof BlockValidationError).toBe(true);
  });
});

describe('RenderError', () => {
  it('creates error with correct properties', () => {
    const emission = environment({ VAR: 'value' });
    const error = new RenderError(emission, 'formatter failed');

    expect(error.name).toMatchInlineSnapshot(`"RenderError"`);
    expect(error.message).toMatchInlineSnapshot(`"Render error for environment: formatter failed"`);
    expect(error.emission).toBe(emission);
  });

  it('is instanceof Error', () => {
    const emission = environment({ VAR: 'value' });
    const error = new RenderError(emission, 'test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof RenderError).toBe(true);
  });
});
