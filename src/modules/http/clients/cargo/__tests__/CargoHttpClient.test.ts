import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { HttpCache, BaseHttpClient, HttpPipelineError, FetchTransport } from '@modules/http';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import { FetchMockHelper, TestLogger } from '@testing-helpers';
import { CargoHttpClient } from '../CargoHttpClient';
import type { CargoMetadata } from '../schemas';
import CARGO_METADATA_FIXTURE from './fixtures--cargo-metadata.json';

setupTestCleanup();
const mockModules = createModuleMocker();

describe('CargoHttpClient', () => {
  let fetchMock: FetchMockHelper;
  let logger: TestLogger;
  let baseClient: BaseHttpClient;
  let cargoClient: CargoHttpClient;

  const MOCK_METADATA = CARGO_METADATA_FIXTURE as unknown as CargoMetadata;

  beforeEach(() => {
    fetchMock = new FetchMockHelper();
    fetchMock.setup();
    fetchMock.reset();

    logger = new TestLogger();
    const transport = new FetchTransport({});
    const cache = new HttpCache();

    baseClient = new BaseHttpClient({
      transport,
      cache,
      logger,
      cacheEnabled: true,
    });

    cargoClient = new CargoHttpClient({
      baseHttpClient: baseClient,
      logger,
    });
  });

  afterAll(() => {
    clearMockRegistry();
    mockModules.restoreAll();
    fetchMock.restore();
  });

  describe('getCrateMetadata', () => {
    test('fetches crate metadata successfully', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_METADATA);

      const metadata = await cargoClient.getCrateMetadata('ripgrep');

      expect(metadata.crate.name).toBe('ripgrep');
      expect(metadata.crate.max_version).toBe('14.1.0');
      expect(metadata.versions.length).toBe(2);
      expect(metadata.versions[0]?.num).toBe('14.1.0');
    });

    test('uses correct crates.io API URL', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_METADATA);

      await cargoClient.getCrateMetadata('test-crate');

      const spy = fetchMock.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
      const callArgs = spy.mock.calls[0];
      expect(callArgs?.[0]).toBe('https://crates.io/api/v1/crates/test-crate');
    });

    test('includes proper User-Agent header', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_METADATA);

      await cargoClient.getCrateMetadata('ripgrep');

      const spy = fetchMock.getSpy();
      const callArgs = spy.mock.calls[0];
      const options = callArgs?.[1] as RequestInit;
      const headers = new Headers(options?.headers);

      expect(headers.get('User-Agent')).toBe('dotfiles-generator');
    });

    test('throws CARGO_CRATE_NOT_FOUND when crate does not exist', async () => {
      fetchMock.mockResponseOnce({ status: 404 });

      try {
        await cargoClient.getCrateMetadata('nonexistent-crate');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpPipelineError);
        const httpError = error as HttpPipelineError;
        expect(httpError.errorCode).toBe('CARGO_CRATE_NOT_FOUND');
      }
    });

    test('throws CARGO_INVALID_METADATA_SCHEMA on invalid response', async () => {
      fetchMock.mockJsonResponseOnce({ invalid: 'data' });

      try {
        await cargoClient.getCrateMetadata('ripgrep');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpPipelineError);
        const httpError = error as HttpPipelineError;
        expect(httpError.errorCode).toBe('CARGO_INVALID_METADATA_SCHEMA');
        expect(httpError.kind).toBe('schema');
      }
    });

    test('caches metadata data', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_METADATA);

      await cargoClient.getCrateMetadata('ripgrep');
      await cargoClient.getCrateMetadata('ripgrep');

      const spy = fetchMock.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('returns crate metadata with all required fields', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_METADATA);

      const metadata = await cargoClient.getCrateMetadata('ripgrep');

      expect(metadata.crate).toBeDefined();
      expect(metadata.crate.id).toBe('rg');
      expect(metadata.crate.name).toBe('ripgrep');
      expect(metadata.crate.downloads).toBe(1000000);
      expect(metadata.crate.description).toBe('Fast line-oriented search tool');
      expect(metadata.crate.repository).toBe('https://github.com/BurntSushi/ripgrep');
      expect(metadata.versions).toBeDefined();
      expect(metadata.versions).toBeArray();
    });

    test('returns version information correctly', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_METADATA);

      const metadata = await cargoClient.getCrateMetadata('ripgrep');

      const latestVersion = metadata.versions[0];
      expect(latestVersion).toBeDefined();
      expect(latestVersion?.num).toBe('14.1.0');
      expect(latestVersion?.yanked).toBe(false);
      expect(latestVersion?.license).toBe('MIT OR Unlicense');
      expect(latestVersion?.downloads).toBe(50000);
    });
  });
});
