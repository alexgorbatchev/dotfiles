import {
  defineTool,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
  type z_internal_UvInstallParams,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type UvInstallParams = z_internal_UvInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type UvParams = InstallParamsRegistry["uv"];
export type InstallIncludesUv = ExpectTrue<"uv" extends InstallMethod ? true : false>;
export type UvParamsMatchSchema = ExpectTrue<UvParams extends UvInstallParams ? true : false>;
export type UvSchemaMatchesParams = ExpectTrue<UvInstallParams extends UvParams ? true : false>;

// Minimal form defaulting package name to tool name
defineTool((install) => install("uv").bin("ruff"));

// With options
defineTool((install) =>
  install("uv", {
    package: "claude-swap",
    version: ">=0.26.0",
    python: ">=3.12",
    with: ["pkgA", "pkgB"],
    force: true,
  })
    .bin("claude-swap")
    .bin("cswap"),
);

// install.uv is not supported at runtime -- must use install("uv", { ... })
expectError(() =>
  defineTool((install) =>
    install.uv({
      package: "black",
      version: "24.10.0",
    }),
  ),
);

expectError(() =>
  defineTool((install) =>
    install("uv", {
      unknown: "property",
    }),
  ),
);

expectError(() =>
  defineTool((install) =>
    install("uv", {
      with: "not-an-array",
    }),
  ),
);

expectError(() =>
  defineTool((install) =>
    install("uv", {
      pypiUrl: "https://pypi.org",
    }),
  ),
);
