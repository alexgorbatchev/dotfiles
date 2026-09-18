import {
  defineTool,
  type z_internal_BrewInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type BrewInstallParams = z_internal_BrewInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type BrewParams = InstallParamsRegistry["brew"];
type UnknownKeyCheck = "unknown" extends keyof BrewParams ? true : false;
type FormulaType = BrewParams["formula"];
export type InstallIncludesBrew = ExpectTrue<"brew" extends InstallMethod ? true : false>;
export type BrewParamsMatchSchema = ExpectTrue<BrewParams extends BrewInstallParams ? true : false>;
export type BrewSchemaMatchesParams = ExpectTrue<BrewInstallParams extends BrewParams ? true : false>;
export type BrewDisallowsUnknown = ExpectTrue<UnknownKeyCheck extends false ? true : false>;
export type BrewFormulaAcceptsString = ExpectTrue<string extends NonNullable<FormulaType> ? true : false>;
export type BrewFormulaOptional = ExpectTrue<undefined extends FormulaType ? true : false>;

defineTool((install) =>
  install("brew", {
    formula: "borders",
    tap: "FelixKratz/formulae",
    trust: true,
  }),
);

defineTool((install) =>
  install("brew", {
    formula: "borders",
    tap: ["FelixKratz/formulae"],
    trust: "FelixKratz/formulae",
  }),
);

defineTool((install) =>
  install("brew", {
    formula: "ripgrep",
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
  install("brew", {
    formula: "visual-studio-code",
    cask: true,
    args: ["--no-quarantine"],
    force: true,
    link: { overwrite: true, force: false },
    service: "start",
    versionArgs: ["--version"],
    versionRegex: /(\d+\.\d+\.\d+)/,
    auto: false,
  }),
);

defineTool((install) => install("brew", { formula: "redis", service: true, link: true }));

expectError(() =>
  defineTool((install) =>
    install("brew", {
      formula: "ripgrep",
      unknown: "value",
    }),
  ),
);

// `cask` is a switch; the cask's name goes in `formula`.
expectError(() => defineTool((install) => install("brew", { cask: "iterm2" })));
