export interface GitHubRateLimitDetails {
  readonly type: 'githubRateLimit';
  readonly limit?: number;
  readonly remaining?: number;
  readonly resetAt?: number;
  readonly resource?: string;
}

export interface ArchivePathTraversalDetails {
  readonly type: 'archivePathTraversal';
  readonly entryPath: string;
  readonly normalizedPath: string;
  readonly rootPath: string;
}

export interface TimeoutDetails {
  readonly type: 'timeout';
  readonly timeoutMs: number;
}

export interface AssetSelectionFailureDetails {
  readonly type: 'assetSelectionFailure';
  readonly selectionPattern: string;
  readonly availableAssets: readonly string[];
}

export interface BodyPreviewDetails {
  readonly type: 'bodyPreview';
  readonly contentType: string;
  readonly preview: string;
  readonly truncated: boolean;
}

export type HttpPipelineErrorDetails =
  | GitHubRateLimitDetails
  | ArchivePathTraversalDetails
  | TimeoutDetails
  | AssetSelectionFailureDetails
  | BodyPreviewDetails;
