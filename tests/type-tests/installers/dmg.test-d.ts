import {
  defineTool,
  type z_internal_DmgInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type DmgInstallParams = z_internal_DmgInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type DmgParams = InstallParamsRegistry["dmg"];
export type InstallIncludesDmg = ExpectTrue<"dmg" extends InstallMethod ? true : false>;
export type DmgParamsMatchSchema = ExpectTrue<DmgParams extends DmgInstallParams ? true : false>;
export type DmgSchemaMatchesParams = ExpectTrue<DmgInstallParams extends DmgParams ? true : false>;
export type DmgSourceIsRequired = ExpectTrue<
  Pick<DmgParams, "source"> extends { source: DmgParams["source"] } ? true : false
>;
export type DmgAppNameIsOptional = ExpectTrue<undefined extends DmgParams["appName"] ? true : false>;

// The documented minimal form: a url source and nothing else.
defineTool((install) =>
  install("dmg", {
    source: { type: "url", url: "https://example.com/MyApp-1.0.0.dmg" },
  }),
);

// A GitHub release source with every parameter the Go installer reads.
defineTool((install) =>
  install("dmg", {
    source: {
      type: "github-release",
      repo: "manaflow-ai/cmux",
      version: "v1.2.3",
      assetPattern: "*macos*.dmg",
    },
    appName: "cmux.app",
    binaryName: "cmux",
    binaryPath: "Contents/MacOS/cmux",
    token: "ghp_example",
    auto: false,
  }),
);

expectError(() =>
  defineTool((install) =>
    install("dmg", {
      source: { type: "url", url: "https://example.com/MyApp.dmg" },
      unknown: "value",
    }),
  ),
);

// The artifact location is always described by `source`.
expectError(() => defineTool((install) => install("dmg", { url: "https://example.com/MyApp.dmg" })));
expectError(() => defineTool((install) => install("dmg", { appName: "MyApp.app" })));

// The source variants are discriminated by `type`.
expectError(() => defineTool((install) => install("dmg", { source: { type: "url", repo: "owner/app" } })));
expectError(() => defineTool((install) => install("dmg", { source: { type: "github-release" } })));

// The runtime does not run the installed app to detect a version.
expectError(() =>
  defineTool((install) =>
    install("dmg", {
      source: { type: "url", url: "https://example.com/MyApp.dmg" },
      versionArgs: ["--version"],
    }),
  ),
);
