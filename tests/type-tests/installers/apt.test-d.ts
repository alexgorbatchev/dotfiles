import {
  defineTool,
  type z_internal_AptInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type AptInstallParams = z_internal_AptInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type AptParams = InstallParamsRegistry["apt"];
type UnknownKeyCheck = "unknown" extends keyof AptParams ? true : false;
type PackageType = AptParams["package"];

export type InstallIncludesApt = ExpectTrue<"apt" extends InstallMethod ? true : false>;
export type AptParamsMatchSchema = ExpectTrue<AptParams extends AptInstallParams ? true : false>;
export type AptSchemaMatchesParams = ExpectTrue<AptInstallParams extends AptParams ? true : false>;
export type AptDisallowsUnknown = ExpectTrue<UnknownKeyCheck extends false ? true : false>;
export type AptPackageAcceptsString = ExpectTrue<string extends NonNullable<PackageType> ? true : false>;
export type AptPackageOptional = ExpectTrue<undefined extends PackageType ? true : false>;

defineTool((install) =>
  install("apt", {
    package: "ripgrep",
    version: "13.0.0-1",
    update: true,
  })
    .bin("rg")
    .sudo(),
);

expectError(() =>
  defineTool((install) =>
    install("apt", {
      package: "ripgrep",
      unknown: "value",
    }),
  ),
);
