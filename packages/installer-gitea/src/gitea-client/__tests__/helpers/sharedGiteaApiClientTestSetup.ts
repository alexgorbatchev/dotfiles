import type { ICache, IDownloader } from "@dotfiles/downloader";
import { TestLogger } from "@dotfiles/logger";
import { mock } from "bun:test";
import { GiteaApiClient } from "../../GiteaApiClient";

interface IMockDownloader extends IDownloader {
  download: ReturnType<typeof mock<IDownloader["download"]>>;
}

interface IMockCache extends ICache {
  get: ReturnType<typeof mock<ICache["get"]>>;
  set: ReturnType<typeof mock<ICache["set"]>>;
  setDownload: ReturnType<typeof mock<ICache["setDownload"]>>;
  has: ReturnType<typeof mock<ICache["has"]>>;
  delete: ReturnType<typeof mock<ICache["delete"]>>;
  clearExpired: ReturnType<typeof mock<ICache["clearExpired"]>>;
  clear: ReturnType<typeof mock<ICache["clear"]>>;
}

interface IGiteaApiClientTestSetupOptions {
  instanceUrl?: string;
  token?: string;
  cacheEnabled?: boolean;
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
    get: mock(async () => null),
    set: mock(async () => {}),
    setDownload: mock(async () => {}),
    has: mock(async () => false),
    delete: mock(async () => {}),
    clearExpired: mock(async () => {}),
    clear: mock(async () => {}),
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
