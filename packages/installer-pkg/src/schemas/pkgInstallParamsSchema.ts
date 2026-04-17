import type { IBaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import type { IGithubReleaseInstallParams } from "@dotfiles/installer-github";
import { githubReleaseInstallParamsSchema } from "@dotfiles/installer-github";
import { z } from "zod";

const githubReleaseSourceParamsSchema = githubReleaseInstallParamsSchema.pick({
  repo: true,
  version: true,
  assetPattern: true,
  assetSelector: true,
  ghCli: true,
  prerelease: true,
});

const pkgUrlSourceSchema = z.object({
  type: z.literal("url"),
  url: z.string().url(),
});

const pkgGitHubReleaseSourceSchema = z
  .object({
    type: z.literal("github-release"),
  })
  .extend(githubReleaseSourceParamsSchema.shape);

export const pkgSourceSchema = z.discriminatedUnion("type", [pkgUrlSourceSchema, pkgGitHubReleaseSourceSchema]);

export const pkgInstallParamsSchema = baseInstallParamsSchema.extend({
  source: pkgSourceSchema,
  target: z.string().optional(),
  binaryPath: z.string().optional(),
  versionArgs: z.array(z.string()).optional(),
  versionRegex: z.union([z.string(), z.instanceof(RegExp)]).optional(),
});

export interface IPkgInstallParams extends IBaseInstallParams {
  source: PkgSource;
  target?: string;
  binaryPath?: string;
  versionArgs?: string[];
  versionRegex?: string | RegExp;
}

export interface IPkgUrlSource {
  type: "url";
  url: string;
}

export interface IPkgGitHubReleaseSource extends Pick<
  IGithubReleaseInstallParams,
  "repo" | "version" | "assetPattern" | "assetSelector" | "ghCli" | "prerelease"
> {
  type: "github-release";
}

export type PkgSource = IPkgUrlSource | IPkgGitHubReleaseSource;
