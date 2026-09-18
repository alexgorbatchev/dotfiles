import {
  defineTool,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
  type z_internal_NpmInstallParams,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type NpmInstallParams = z_internal_NpmInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type NpmParams = InstallParamsRegistry["npm"];
export type InstallIncludesNpm = ExpectTrue<"npm" extends InstallMethod ? true : false>;
export type NpmParamsMatchSchema = ExpectTrue<NpmParams extends NpmInstallParams ? true : false>;
export type NpmSchemaMatchesParams = ExpectTrue<NpmInstallParams extends NpmParams ? true : false>;

defineTool((install) =>
  install("npm", {
    package: "prettier",
  }).zsh((shell) =>
    shell.once(/* zsh */ `
        echo "once"
      `).always(/* zsh */ `
        echo "always"
      `),
  ),
);

// Every parameter the Go installer reads.
defineTool((install) =>
  install("npm", {
    package: "prettier",
    version: "3.0.0",
    packageManager: "bun",
    force: true,
    auto: false,
  }).bin("prettier"),
);

expectError(() =>
  defineTool((install) =>
    install("npm", {
      package: "prettier",
      unknown: "value",
    }),
  ),
);

// Anything other than "bun" is treated as npm by the runtime, so only the two names
// that select a package manager are accepted.
expectError(() =>
  defineTool((install) =>
    install("npm", {
      package: "prettier",
      packageManager: "pnpm",
    }),
  ),
);
