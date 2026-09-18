import {
  defineTool,
  type z_internal_CargoInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type CargoInstallParams = z_internal_CargoInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type CargoParams = InstallParamsRegistry["cargo"];
export type InstallIncludesCargo = ExpectTrue<"cargo" extends InstallMethod ? true : false>;
export type CargoParamsMatchSchema = ExpectTrue<CargoParams extends CargoInstallParams ? true : false>;
export type CargoSchemaMatchesParams = ExpectTrue<CargoInstallParams extends CargoParams ? true : false>;

defineTool((install) =>
  install("cargo", {
    crateName: "ripgrep",
  }).zsh((shell) =>
    shell.once(/* zsh */ `
        echo "once"
      `).always(/* zsh */ `
        echo "always"
      `),
  ),
);

// Every parameter the Go installer reads. The crate name defaults to the tool name.
defineTool((install) =>
  install("cargo", {
    binarySource: "github-releases",
    githubRepo: "eza-community/eza",
    assetPattern: "eza-v{version}-{arch}-{platform}.tar.gz",
    sha256: "0123456789abcdef",
    auto: true,
  }).bin("eza"),
);

defineTool((install) => install("cargo", { crateName: "bat", binarySource: "cargo-quickinstall" }).bin("bat"));

expectError(() =>
  defineTool((install) =>
    install("cargo", {
      crateName: "ripgrep",
      unknown: "value",
    }),
  ),
);

// The two binary sources are the only ones the runtime knows.
expectError(() => defineTool((install) => install("cargo", { crateName: "bat", binarySource: "crates-io" })));

// The version comes from .version(), not from an install parameter.
expectError(() => defineTool((install) => install("cargo", { crateName: "bat", version: "0.24.0" })));

// Binaries are declared with .bin(); the runtime reads no customBinaries list.
expectError(() => defineTool((install) => install("cargo", { crateName: "fd-find", customBinaries: ["fd"] })));
