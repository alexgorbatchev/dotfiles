import { describe, expect, it } from 'bun:test';
import {
  alias,
  completion,
  environment,
  fn,
  path,
  script,
  source,
  sourceFile,
  sourceFunction,
} from '../factories';
import {
  isAliasEmission,
  isCompletionEmission,
  isEnvironmentEmission,
  isFunctionEmission,
  isHoisted,
  isPathEmission,
  isScriptEmission,
  isSourceEmission,
  isSourceFileEmission,
  isSourceFunctionEmission,
} from '../guards';

describe('isEnvironmentEmission', () => {
  it('returns true for environment emission', () => {
    const emission = environment({ VAR: 'value' });
    expect(isEnvironmentEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = fn('test', 'echo');
    expect(isEnvironmentEmission(emission)).toBe(false);
  });
});

describe('isAliasEmission', () => {
  it('returns true for alias emission', () => {
    const emission = alias({ ll: 'ls -la' });
    expect(isAliasEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = environment({ VAR: 'value' });
    expect(isAliasEmission(emission)).toBe(false);
  });
});

describe('isFunctionEmission', () => {
  it('returns true for function emission', () => {
    const emission = fn('test', 'echo test');
    expect(isFunctionEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = alias({ ll: 'ls -la' });
    expect(isFunctionEmission(emission)).toBe(false);
  });
});

describe('isScriptEmission', () => {
  it('returns true for script emission', () => {
    const emission = script('echo test', 'always');
    expect(isScriptEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = fn('test', 'echo test');
    expect(isScriptEmission(emission)).toBe(false);
  });
});

describe('isSourceFileEmission', () => {
  it('returns true for sourceFile emission', () => {
    const emission = sourceFile('$HOME/.rc');
    expect(isSourceFileEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = script('echo test', 'always');
    expect(isSourceFileEmission(emission)).toBe(false);
  });
});

describe('isSourceEmission', () => {
  it('returns true for source emission', () => {
    const emission = source('echo test', '__source_fn');
    expect(isSourceEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = sourceFile('$HOME/.rc');
    expect(isSourceEmission(emission)).toBe(false);
  });

  it('returns false for sourceFunction emission', () => {
    const emission = sourceFunction('initTool');
    expect(isSourceEmission(emission)).toBe(false);
  });
});

describe('isSourceFunctionEmission', () => {
  it('returns true for sourceFunction emission', () => {
    const emission = sourceFunction('initTool');
    expect(isSourceFunctionEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = sourceFile('$HOME/.rc');
    expect(isSourceFunctionEmission(emission)).toBe(false);
  });
});

describe('isCompletionEmission', () => {
  it('returns true for completion emission', () => {
    const emission = completion({ commands: ['node'] });
    expect(isCompletionEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = sourceFunction('initTool');
    expect(isCompletionEmission(emission)).toBe(false);
  });
});

describe('isPathEmission', () => {
  it('returns true for path emission', () => {
    const emission = path('/usr/local/bin');
    expect(isPathEmission(emission)).toBe(true);
  });

  it('returns false for other emissions', () => {
    const emission = completion({ commands: ['node'] });
    expect(isPathEmission(emission)).toBe(false);
  });
});

describe('isHoisted', () => {
  it('returns true for environment emissions', () => {
    expect(isHoisted(environment({ VAR: 'value' }))).toBe(true);
  });

  it('returns true for path emissions', () => {
    expect(isHoisted(path('/bin'))).toBe(true);
  });

  it('returns true for completion emissions', () => {
    expect(isHoisted(completion({ commands: ['node'] }))).toBe(true);
  });

  it('returns false for alias emissions', () => {
    expect(isHoisted(alias({ ll: 'ls' }))).toBe(false);
  });

  it('returns false for function emissions', () => {
    expect(isHoisted(fn('test', 'echo'))).toBe(false);
  });

  it('returns false for script emissions', () => {
    expect(isHoisted(script('echo', 'always'))).toBe(false);
  });

  it('returns false for sourceFile emissions', () => {
    expect(isHoisted(sourceFile('$HOME/.rc'))).toBe(false);
  });

  it('returns false for sourceFunction emissions', () => {
    expect(isHoisted(sourceFunction('init'))).toBe(false);
  });
});
