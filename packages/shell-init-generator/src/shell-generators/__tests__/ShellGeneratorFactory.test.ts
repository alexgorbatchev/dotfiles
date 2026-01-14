import type { ProjectConfig } from '@dotfiles/config';
import type { ShellType } from '@dotfiles/core';
import { beforeEach, describe, expect, it } from 'bun:test';
import { BashGenerator } from '../BashGenerator';
import { PowerShellGenerator } from '../PowerShellGenerator';
import * as ShellGeneratorFactory from '../ShellGeneratorFactory';
import { ZshGenerator } from '../ZshGenerator';
import { createMockProjectConfigWithPathsOnly } from './createMockProjectConfigWithPathsOnly';

describe('ShellGeneratorFactory', () => {
  let mockProjectConfig: ProjectConfig;

  beforeEach(() => {
    mockProjectConfig = createMockProjectConfigWithPathsOnly();
  });

  it('should create zsh generator', () => {
    const generator = ShellGeneratorFactory.createGenerator('zsh', mockProjectConfig);
    expect(generator).toBeInstanceOf(ZshGenerator);
    expect(generator.shellType).toBe('zsh');
  });

  it('should create bash generator', () => {
    const generator = ShellGeneratorFactory.createGenerator('bash', mockProjectConfig);
    expect(generator).toBeInstanceOf(BashGenerator);
    expect(generator.shellType).toBe('bash');
  });

  it('should create powershell generator', () => {
    const generator = ShellGeneratorFactory.createGenerator('powershell', mockProjectConfig);
    expect(generator).toBeInstanceOf(PowerShellGenerator);
    expect(generator.shellType).toBe('powershell');
  });

  it('should throw error for unsupported shell type', () => {
    expect(() => ShellGeneratorFactory.createGenerator('fish' as ShellType, mockProjectConfig)).toThrow(
      'Unsupported shell type: fish',
    );
  });

  it('should return supported shell types', () => {
    const supportedTypes = ShellGeneratorFactory.getSupportedShellTypes();
    expect(supportedTypes).toEqual(['zsh', 'bash', 'powershell']);
  });

  it('should create all generators', () => {
    const generators = ShellGeneratorFactory.createAllGenerators(mockProjectConfig);

    expect(generators.size).toBe(3);
    expect(generators.get('zsh')).toBeInstanceOf(ZshGenerator);
    expect(generators.get('bash')).toBeInstanceOf(BashGenerator);
    expect(generators.get('powershell')).toBeInstanceOf(PowerShellGenerator);
  });

  it('should check if shell type is supported', () => {
    expect(ShellGeneratorFactory.isSupported('zsh')).toBe(true);
    expect(ShellGeneratorFactory.isSupported('bash')).toBe(true);
    expect(ShellGeneratorFactory.isSupported('powershell')).toBe(true);
    expect(ShellGeneratorFactory.isSupported('fish')).toBe(false);
    expect(ShellGeneratorFactory.isSupported('invalid')).toBe(false);
  });
});
