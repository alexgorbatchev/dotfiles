import { describe, expect, it, mock } from 'bun:test';
import { VersionComparisonStatus } from '@modules/version-checker';
import { createCliTestSetup } from './createCliTestSetup';

describe('createCliTestSetup', () => {
  it('should work with true for default mocks', async () => {
    const setup = await createCliTestSetup({
      testName: 'default-test',
      services: {
        installer: true,
        githubApiClient: true,
      },
    });

    expect(setup.mockServices.installer).toBeDefined();
    expect(setup.mockServices.githubApiClient).toBeDefined();
    expect(setup.mockServices.versionChecker).toBeUndefined();
  });

  it('should work with custom mock objects', async () => {
    const customInstaller = {
      install: mock(async () => ({ success: false, error: 'Custom mock' })),
    };

    const setup = await createCliTestSetup({
      testName: 'object-test',
      services: {
        installer: customInstaller,
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
          getLatestToolVersion: mock(async () => '1.0.0'),
        },
      },
    });

    expect(setup.mockServices.installer).toBe(customInstaller);
    expect(setup.mockServices.versionChecker).toBeDefined();
    expect(setup.mockServices.githubApiClient).toBeUndefined();
  });

  it('should work with mixed true and custom mocks', async () => {
    const customInstaller = {
      install: mock(async () => ({ success: false, error: 'Custom mock' })),
    };

    const setup = await createCliTestSetup({
      testName: 'mixed-test',
      services: {
        installer: customInstaller, // custom mock
        githubApiClient: true, // default mock
      },
    });

    expect(setup.mockServices.installer).toBe(customInstaller);
    expect(setup.mockServices.githubApiClient).toBeDefined();
    expect(setup.mockServices.versionChecker).toBeUndefined();
  });

  it('should create proper Services object', async () => {
    const setup = await createCliTestSetup({
      testName: 'services-test',
      services: {
        installer: true,
      },
    });

    const services = setup.createServices();
    
    expect(services.yamlConfig).toBeDefined();
    expect(services.fs).toBeDefined();
    expect(services.installer).toBe(setup.mockServices.installer!);
  });
});