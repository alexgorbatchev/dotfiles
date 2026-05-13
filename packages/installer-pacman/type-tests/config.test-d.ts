import {
  defineTool,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
  type z_internal_PacmanInstallParams,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type PacmanInstallParams = z_internal_PacmanInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type PacmanParams = InstallParamsRegistry["pacman"];
type UnknownKeyCheck = "unknown" extends keyof PacmanParams ? true : false;
type PackageType = PacmanParams["package"];

export type InstallIncludesPacman = ExpectTrue<"pacman" extends InstallMethod ? true : false>;
export type PacmanParamsMatchSchema = ExpectTrue<PacmanParams extends PacmanInstallParams ? true : false>;
export type PacmanSchemaMatchesParams = ExpectTrue<PacmanInstallParams extends PacmanParams ? true : false>;
export type PacmanDisallowsUnknown = ExpectTrue<UnknownKeyCheck extends false ? true : false>;
export type PacmanPackageAcceptsString = ExpectTrue<string extends NonNullable<PackageType> ? true : false>;
export type PacmanPackageOptional = ExpectTrue<undefined extends PackageType ? true : false>;

defineTool((install) =>
  install("pacman", {
    package: "ripgrep",
    version: "13.0.0-1",
    sysupgrade: true,
  })
    .bin("rg")
    .sudo(),
);

expectError(() =>
  defineTool((install) =>
    install("pacman", {
      package: "ripgrep",
      unknown: "value",
    }),
  ),
);
