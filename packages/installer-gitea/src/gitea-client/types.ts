export interface IGiteaApiClientOptions {
  token?: string;
  cacheEnabled?: boolean;
  cacheTtlMs?: number;
}

export interface IGiteaReleaseQueryOptions {
  limit?: number;
  includePrerelease?: boolean;
  maxResults?: number;
}
