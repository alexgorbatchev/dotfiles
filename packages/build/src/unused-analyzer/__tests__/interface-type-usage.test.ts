import { describe, expect, test } from 'bun:test';
import { Project } from 'ts-morph';
import { findUnusedExports } from '../analyze-project/findUnusedExports';
import { findUnusedProperties } from '../analyze-project/findUnusedProperties';
import { isTestFile } from '../analyze-project/isTestFile';
import { formatResults } from '../formatResults';
import type { AnalysisResults } from '../types';

describe('Interface and Type Usage', () => {
  test('does not report properties as unused when the entire interface is used', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    // Create interface with properties
    project.createSourceFile(
      '/types.ts',
      `
        export interface Config {
          timeout: number;
          retries: number;
          debug: boolean;
        }
      `
    );

    // Use the entire interface (not individual properties)
    project.createSourceFile(
      '/usage.ts',
      `
        import type { Config } from './types';
        
        function processConfig(config: Config): void {
          console.log('Processing config');
        }
        
        const myConfig: Config = {
          timeout: 5000,
          retries: 3,
          debug: true
        };
        
        processConfig(myConfig);
      `
    );

    const unusedProperties = findUnusedProperties(project, '/', isTestFile);

    // The interface Config is used, so its properties should NOT be reported as unused
    expect(unusedProperties).toHaveLength(0);
  });

  test('does not report properties as unused when the entire type alias is used', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    // Create type alias with properties
    project.createSourceFile(
      '/types.ts',
      `
        export type Config = {
          timeout: number;
          retries: number;
          debug: boolean;
        };
      `
    );

    // Use the entire type (not individual properties)
    project.createSourceFile(
      '/usage.ts',
      `
        import type { Config } from './types';
        
        function processConfig(config: Config): void {
          console.log('Processing config');
        }
        
        const myConfig: Config = {
          timeout: 5000,
          retries: 3,
          debug: true
        };
        
        processConfig(myConfig);
      `
    );

    const unusedProperties = findUnusedProperties(project, '/', isTestFile);

    // The type Config is used, so its properties should NOT be reported as unused
    expect(unusedProperties).toHaveLength(0);
  });

  test('reports properties as unused when interface is not used', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    // Create unused interface
    project.createSourceFile(
      '/types.ts',
      `
        export interface UnusedConfig {
          timeout: number;
          retries: number;
        }
      `
    );

    const unusedExports = findUnusedExports(project, '/', isTestFile);
    const unusedProperties = findUnusedProperties(project, '/', isTestFile);

    const results: AnalysisResults = { unusedExports, unusedProperties };
    const output = formatResults(results);

    // The interface is unused, so it should be in unusedExports
    // but we shouldn't also report each property as unused
    expect(unusedExports).toHaveLength(1);
    expect(unusedExports[0]?.exportName).toBe('UnusedConfig');
    expect(unusedProperties).toHaveLength(2); // Properties ARE found by analysis
    expect(output).toContain('UnusedConfig'); // But only the interface appears in output
    expect(output).not.toContain('timeout'); // Properties are filtered out
    expect(output).not.toContain('retries');
  });
});
