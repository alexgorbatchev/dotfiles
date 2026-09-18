import {
  defineTool,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
  type z_internal_PkgInstallParams,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type PkgInstallParams = z_internal_PkgInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type PkgParams = InstallParamsRegistry["pkg"];
export type InstallIncludesPkg = ExpectTrue<"pkg" extends InstallMethod ? true : false>;
export type PkgParamsMatchSchema = ExpectTrue<PkgParams extends PkgInstallParams ? true : false>;
export type PkgSchemaMatchesParams = ExpectTrue<PkgInstallParams extends PkgParams ? true : false>;
export type PkgSourceIsRequired = ExpectTrue<
  Pick<PkgParams, "source"> extends { source: PkgParams["source"] } ? true : false
>;

defineTool((install) =>
  install("pkg", {
    source: { type: "url", url: "https://example.com/releases/my-tool.pkg" },
  }).bin("my-tool"),
);

// Every parameter the Go installer reads.
defineTool((install) =>
  install("pkg", {
    source: { type: "github-release", repo: "owner/tool", assetPattern: "*macos*.pkg" },
    target: "/",
    token: "ghp_example",
    auto: false,
  })
    .bin("tool")
    .sudo(),
);

expectError(() =>
  defineTool((install) =>
    install("pkg", {
      source: { type: "url", url: "https://example.com/my-tool.pkg" },
      unknown: "value",
    }),
  ),
);

// The artifact location is always described by `source`.
expectError(() => defineTool((install) => install("pkg", { url: "https://example.com/my-tool.pkg" })));

// Binaries of an installed package are resolved from PATH; there is no binaryPath.
expectError(() =>
  defineTool((install) =>
    install("pkg", {
      source: { type: "url", url: "https://example.com/my-tool.pkg" },
      binaryPath: "/usr/local/bin/my-tool",
    }),
  ),
);
