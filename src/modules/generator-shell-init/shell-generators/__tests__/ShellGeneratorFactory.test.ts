import { describe, expect, it, beforeEach } from 'bun:test';
import { ShellGeneratorFactory } from '../ShellGeneratorFactory';
import { ZshGenerator } from '../ZshGenerator';
import { BashGenerator } from '../BashGenerator';
import { PowerShellGenerator } from '../PowerShellGenerator';
import type { YamlConfig } from '@modules/config';

describe('ShellGeneratorFactory', () => {
  let mockAppConfig: YamlConfig;

  beforeEach(() => {
    mockAppConfig = {
      paths: {
        homeDir: '/home/test',
        dotfilesDir: '/home/test/.dotfiles',
        generatedDir: '/home/test/.dotfiles/.generated',
        shellScriptsDir: '/home/test/.dotfiles/.generated/shell-scripts',
        binariesDir: '/home/test/.dotfiles/.generated/bin',
        targetDir: '/usr/local/bin',
        toolConfigsDir: '/home/test/.dotfiles/configs/tools',
        manifestPath: '/home/test/.dotfiles/.generated/manifest.json',
      },
    } as YamlConfig;
  });
  it('should create zsh generator', () => {
    const generator = ShellGeneratorFactory.createGenerator('zsh', mockAppConfig);
    expect(generator).toBeInstanceOf(ZshGenerator);
    expect(generator.shellType).toBe('zsh');
  });

  it('should create bash generator', () => {
    const generator = ShellGeneratorFactory.createGenerator('bash', mockAppConfig);
    expect(generator).toBeInstanceOf(BashGenerator);
    expect(generator.shellType).toBe('bash');
  });

  it('should create powershell generator', () => {
    const generator = ShellGeneratorFactory.createGenerator('powershell', mockAppConfig);
    expect(generator).toBeInstanceOf(PowerShellGenerator);
    expect(generator.shellType).toBe('powershell');
  });

  it('should throw error for unsupported shell type', () => {
    expect(() => ShellGeneratorFactory.createGenerator('fish' as any, mockAppConfig)).toThrow(
      'Unsupported shell type: fish'
    );
  });

  it('should return supported shell types', () => {
    const supportedTypes = ShellGeneratorFactory.getSupportedShellTypes();
    expect(supportedTypes).toEqual(['zsh', 'bash', 'powershell']);
  });

  it('should create all generators', () => {
    const generators = ShellGeneratorFactory.createAllGenerators(mockAppConfig);
    
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