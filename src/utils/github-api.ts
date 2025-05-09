import { z } from 'zod';
// Use native fetch by default, but allow injection
import { createLogger } from './logger';
import { config } from '../config'; // Use the pre-loaded config

// Define the expected fetch function signature
type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit | undefined
) => Promise<Response>;

const logger = createLogger('github-api');
const BASE_URL = 'https://api.github.com';

// Zod Schema for GitHub User
const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  node_id: z.string(),
  avatar_url: z.string().url(),
  gravatar_id: z.string().nullable(),
  url: z.string().url(),
  html_url: z.string().url(),
  followers_url: z.string().url(),
  following_url: z.string().url(),
  gists_url: z.string().url(),
  starred_url: z.string().url(),
  subscriptions_url: z.string().url(),
  organizations_url: z.string().url(),
  repos_url: z.string().url(),
  events_url: z.string().url(),
  received_events_url: z.string().url(),
  type: z.string(),
  site_admin: z.boolean(),
  // user_view_type might be present, but let's keep it simple unless needed
});
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

// Zod Schema for GitHub Release Asset
const GitHubReleaseAssetSchema = z.object({
  url: z.string().url(),
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  label: z.string().nullable(),
  uploader: GitHubUserSchema,
  content_type: z.string(),
  state: z.string(), // "uploaded"
  size: z.number(),
  download_count: z.number(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  browser_download_url: z.string().url(),
});
export type GitHubReleaseAsset = z.infer<typeof GitHubReleaseAssetSchema>;

// Zod Schema for GitHub Release Reactions
const GitHubReactionsSchema = z.object({
  url: z.string().url(),
  total_count: z.number(),
  '+1': z.number(),
  '-1': z.number(),
  laugh: z.number(),
  hooray: z.number(),
  confused: z.number(),
  heart: z.number(),
  rocket: z.number(),
  eyes: z.number(),
});
export type GitHubReactions = z.infer<typeof GitHubReactionsSchema>;

// Zod Schema for GitHub Release
const GitHubReleaseSchema = z.object({
  url: z.string().url(),
  assets_url: z.string().url(),
  upload_url: z.string().url(), // Note: this often has {?name,label}
  html_url: z.string().url(),
  id: z.number(),
  author: GitHubUserSchema,
  node_id: z.string(),
  tag_name: z.string(),
  target_commitish: z.string(),
  name: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: z.string().datetime(),
  published_at: z.string().datetime().nullable(), // Can be null for drafts
  assets: z.array(GitHubReleaseAssetSchema),
  tarball_url: z.string().url().nullable(),
  zipball_url: z.string().url().nullable(),
  body: z.string().nullable(),
  reactions: GitHubReactionsSchema.optional(), // Reactions might not always be present
});
export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

// Schema for an array of releases
const GitHubReleasesSchema = z.array(GitHubReleaseSchema);

export class GitHubApiClient {
  private headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'dotfiles-generator',
  };
  private fetchFn: FetchFunction; // Store the fetch implementation

  constructor(fetchImplementation: FetchFunction = fetch) {
    this.fetchFn = fetchImplementation; // Use injected or global fetch
    logger('GitHubApiClient: constructor: GITHUB_TOKEN_present=%s', !!config.GITHUB_TOKEN);
    if (config.GITHUB_TOKEN) {
      this.headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
    }
  }

  async getLatestRelease(repo: string): Promise<GitHubRelease> {
    logger('getLatestRelease: repo=%s', repo);
    const data = await this.fetchFromGitHub<unknown>(`/repos/${repo}/releases/latest`);
    try {
      return GitHubReleaseSchema.parse(data);
    } catch (error) {
      // logger('Zod validation error for getLatestRelease: %o', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to validate latest release data for ${repo}: ${message}`);
    }
  }

  async getReleases(repo: string): Promise<GitHubRelease[]> {
    logger('getReleases: repo=%s', repo);
    // TODO: Implement pagination if needed for repos with many releases
    const data = await this.fetchFromGitHub<unknown[]>(`/repos/${repo}/releases`);
    try {
      return GitHubReleasesSchema.parse(data);
    } catch (error) {
      // logger('Zod validation error for getReleases: %o', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to validate releases data for ${repo}: ${message}`);
    }
  }

  async getReleaseByTag(repo: string, tag: string): Promise<GitHubRelease> {
    logger('getReleaseByTag: repo=%s, tag=%s', repo, tag);
    const data = await this.fetchFromGitHub<unknown>(`/repos/${repo}/releases/tags/${tag}`);
    try {
      return GitHubReleaseSchema.parse(data);
    } catch (error) {
      // logger('Zod validation error for getReleaseByTag: %o', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to validate release by tag data for ${repo} (${tag}): ${message}`);
    }
  }

  private async fetchFromGitHub<T>(apiPath: string): Promise<T> {
    logger('fetchFromGitHub: apiPath=%s', apiPath);
    const url = `${BASE_URL}${apiPath}`;

    try {
      // TODO: Implement caching logic here if CACHE_ENABLED is true
      // const cachedData = await this.getFromCache(url);
      // if (cachedData) {
      //   // logger('Using cached data for %s', url);
      //   return cachedData;
      // }

      // Use the stored fetch function
      const response = await this.fetchFn(url, { headers: this.headers });

      this.checkRateLimits(response); // Keep this call, its internal logging will be modified

      // Check status code explicitly instead of relying on response.ok
      if (response.status < 200 || response.status >= 300) {
        // logger('Entering error block. Status: %s', response.status);
        const errorBody = await response.text();
        // logger('GitHub API error response body: %s', errorBody);
        let errorMessage = `GitHub API error: ${response.status} ${response.statusText}`;
        try {
          // logger('Attempting to parse errorBody as JSON...');
          const errorJson = JSON.parse(errorBody);
          // logger('Successfully parsed errorBody. errorJson: %o', errorJson);
          if (errorJson.message) {
            errorMessage += ` - ${errorJson.message}`;
            // logger('Appended errorJson.message to errorMessage.');
          }
        } catch (e) {
          // logger('Failed to parse errorBody as JSON or access message property. Error: %o', e);
          /* Ignore JSON parse error if errorBody is not JSON */
        }
        // logger('Throwing error with message: %s', errorMessage);
        throw new Error(errorMessage);
      }

      // logger('Response was .ok. Attempting to parse response.json()...');
      const data = await response.json();

      // TODO: Save data to cache if caching is implemented
      // await this.saveToCache(url, data);

      return data as T; // Data is now validated by the calling methods
    } catch (error) {
      // logger('Error fetching from GitHub URL %s: %o', url, error);
      throw error;
    }
  }

  // Use global Response type
  private checkRateLimits(response: Response): void {
    logger('checkRateLimits: responseStatus=%s', response.status);
    // const limit = response.headers.get('X-RateLimit-Limit');
    // const remaining = response.headers.get('X-RateLimit-Remaining');
    // const reset = response.headers.get('X-RateLimit-Reset');

    // if (limit && remaining && reset) {
    //   const resetDate = new Date(parseInt(reset, 10) * 1000);
    //   // logger(
    //   //   'GitHub API Rate Limit: %s/%s remaining. Resets at: %s',
    //   //   remaining,
    //   //   limit,
    //   //   resetDate.toLocaleTimeString()
    //   // );
    //   if (parseInt(remaining, 10) === 0) {
    //     // logger('WARNING: GitHub API rate limit exhausted!');
    //   }
    // } else {
    //   // logger('GitHub API Rate Limit headers not found.');
    // }
  }

  // TODO: Implement cache methods (getFromCache, saveToCache)
}
