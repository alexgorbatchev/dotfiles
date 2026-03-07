import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { generateDistPackageJson } from '../steps/generateDistPackageJson';
import type { IBuildContext, IDependencyVersions } from '../types';
import {
  FIXTURE_REQUIRED_DEPENDENCY_FIELDS,
  FIXTURE_SAMPLE_DEPENDENCY_VERSIONS,
  FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES,
} from './fixtures/fixtures--dist-package-json';
import { createMockBuildContext } from './helpers/createMockBuildContext';
import { setupTmpDir } from './helpers/manageTmpDir';

const tmpHelper = setupTmpDir(__dirname);

describe('generateDistPackageJson', () => {
  let mockContext: IBuildContext;
  let tempFile: string;

  beforeEach(() => {
    tmpHelper.ensureDir();
    tempFile = path.join(tmpHelper.TMP_DIR, `package-${Date.now()}.json`);
    mockContext = createMockBuildContext({
      paths: {
        outputPackageJsonPath: tempFile,
      },
    });
  });

  afterEach(() => {
    tmpHelper.cleanup(tempFile);
  });

  test('generates valid package.json file', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    expect(fs.existsSync(tempFile)).toBe(true);
  });

  test('generated package.json is valid JSON', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
  });

  test('generated package.json has required fields', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const packageJson = JSON.parse(content);

    expect(packageJson.name).toBe('@gitea/dotfiles');
    expect(packageJson.type).toBe('module');
    expect(packageJson.bin).toBeDefined();
    expect(packageJson.types).toBe('./schemas.d.ts');
    expect(packageJson.exports).toBeDefined();
    expect(packageJson.files).toBeDefined();
    expect(packageJson.dependencies).toBeDefined();
  });

  test('includes bin field with dotfiles executable', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const packageJson = JSON.parse(content);

    expect(packageJson.bin.dotfiles).toBe('./cli.js');
  });

  test('includes exports field with proper structure', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const packageJson = JSON.parse(content);

    expect(packageJson.exports['.'].import.default).toBe('./cli.js');
    expect(packageJson.exports['.'].import.types).toBe('./schemas.d.ts');
  });

  test('includes all required dependencies in dependencies field', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const packageJson = JSON.parse(content);

    for (const field of FIXTURE_REQUIRED_DEPENDENCY_FIELDS) {
      expect(packageJson.dependencies).toHaveProperty(field);
    }
  });

  test('includes runtime dependencies in dependencies field', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const packageJson = JSON.parse(content);

    for (const [depName, depVersion] of Object.entries(runtimeDependencies)) {
      expect(packageJson.dependencies[depName]).toBe(depVersion);
    }
  });

  test('correctly sets type dependency versions', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const packageJson = JSON.parse(content);

    expect(packageJson.dependencies['@types/bun']).toBe(dependencyVersions.bunTypes);
    expect(packageJson.dependencies['@types/node']).toBe(dependencyVersions.nodeTypes);
  });

  test('generated package.json is properly formatted with indentation', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');

    // Should have proper formatting (contains newlines and indentation)
    expect(content).toContain('\n');
    expect(content).toContain('  ');
  });

  test('generated package.json includes files array with all required patterns', async () => {
    const dependencyVersions: IDependencyVersions = FIXTURE_SAMPLE_DEPENDENCY_VERSIONS;
    const runtimeDependencies: Record<string, string> = FIXTURE_SAMPLE_RUNTIME_DEPENDENCIES;

    await generateDistPackageJson(mockContext, dependencyVersions, runtimeDependencies);

    const content = fs.readFileSync(tempFile, 'utf-8');
    const packageJson = JSON.parse(content);

    expect(Array.isArray(packageJson.files)).toBe(true);
    expect(packageJson.files).toContain('*.js');
    expect(packageJson.files).toContain('*.js.map');
    expect(packageJson.files).toContain('*.d.ts');
    expect(packageJson.files).toContain('*.css');
    expect(packageJson.files).toContain('skill');
  });
});
