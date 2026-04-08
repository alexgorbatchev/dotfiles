import type { ICache, IDownloader } from "@dotfiles/downloader";
import { TestLogger } from "@dotfiles/logger";
import { mock, type Mock } from "bun:test";
import { GiteaApiClient } from "../../GiteaApiClient";

interface IMockDownloader extends IDownloader {
  download: ReturnType<typeof mock<IDownloader["download"]>>;
}

type CacheWithoutGenericMethods = Omit<ICache, "get" | "set">;
type CacheGetImplementation = (key: string) => Promise<unknown | null>;
type CacheSetImplementation = (key: string, data: unknown, ttlMs?: number) => Promise<void>;
type CacheGetMockController = Mock<CacheGetImplementation>;
type CacheSetMockController = Mock<CacheSetImplementation>;
type CacheGetMock = ICache["get"] & CacheGetMockController;
type CacheSetMock = ICache["set"] & CacheSetMockController;
type CacheSetDownloadMock = ReturnType<typeof mock<ICache["setDownload"]>>;
type CacheHasMock = ReturnType<typeof mock<ICache["has"]>>;
type CacheDeleteMock = ReturnType<typeof mock<ICache["delete"]>>;
type CacheClearExpiredMock = ReturnType<typeof mock<ICache["clearExpired"]>>;
type CacheClearMock = ReturnType<typeof mock<ICache["clear"]>>;

interface IMockCache extends CacheWithoutGenericMethods {
  get: CacheGetMock;
  set: CacheSetMock;
  setDownload: CacheSetDownloadMock;
  has: CacheHasMock;
  delete: CacheDeleteMock;
  clearExpired: CacheClearExpiredMock;
  clear: CacheClearMock;
}

interface IGiteaApiClientTestSetupOptions {
  instanceUrl?: string;
  token?: string;
  cacheEnabled?: boolean;
}

function createCacheGetMock(): CacheGetMock {
  return mock<CacheGetImplementation>(async (_key: string) => null) as CacheGetMock;
}

function createCacheSetMock(): CacheSetMock {
  return mock<CacheSetImplementation>(async (_key: string, _data: unknown, _ttlMs?: number) => {}) as CacheSetMock;
}

export const createMockDownloader = (): IMockDownloader => {
  const mockDownloadFn = mock<IDownloader["download"]>(async () => Buffer.from(""));
  const mockRegisterStrategy = mock<IDownloader["registerStrategy"]>(() => {});
  const mockDownloadToFile = mock<IDownloader["downloadToFile"]>(async () => {});
  return {
    download: mockDownloadFn,
    registerStrategy: mockRegisterStrategy,
    downloadToFile: mockDownloadToFile,
  };
};

export const createMockGiteaApiCache = (): IMockCache => {
  return {
    get: createCacheGetMock(),
    set: createCacheSetMock(),
    setDownload: mock<ICache["setDownload"]>(
      async (_key: string, _data: Buffer, _ttlMs: number | undefined, _url: string, _contentType?: string) => {},
    ),
    has: mock<ICache["has"]>(async (_key: string) => false),
    delete: mock<ICache["delete"]>(async (_key: string) => {}),
    clearExpired: mock<ICache["clearExpired"]>(async () => {}),
    clear: mock<ICache["clear"]>(async () => {}),
  };
};

export interface IMockSetup {
  mockDownloader: IMockDownloader;
  mockCache: IMockCache;
  apiClient: GiteaApiClient;
  logger: TestLogger;
}

export const setupMockGiteaApiClient = (options?: IGiteaApiClientTestSetupOptions): IMockSetup => {
  const mockDownloader = createMockDownloader();
  const mockCache = createMockGiteaApiCache();
  const logger = new TestLogger();

  const apiClient = new GiteaApiClient(
    logger,
    options?.instanceUrl ?? "https://codeberg.org",
    mockDownloader,
    mockCache,
    {
      token: options?.token ?? "",
      cacheEnabled: options?.cacheEnabled ?? false,
    },
  );

  return {
    mockDownloader,
    mockCache,
    apiClient,
    logger,
  };
};
