import {
  defineTool,
  type z_internal_DnfInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type DnfInstallParams = z_internal_DnfInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type DnfParams = InstallParamsRegistry["dnf"];
type UnknownKeyCheck = "unknown" extends keyof DnfParams ? true : false;
type PackageType = DnfParams["package"];

export type InstallIncludesDnf = ExpectTrue<"dnf" extends InstallMethod ? true : false>;
export type DnfParamsMatchSchema = ExpectTrue<DnfParams extends DnfInstallParams ? true : false>;
export type DnfSchemaMatchesParams = ExpectTrue<DnfInstallParams extends DnfParams ? true : false>;
export type DnfDisallowsUnknown = ExpectTrue<UnknownKeyCheck extends false ? true : false>;
export type DnfPackageAcceptsString = ExpectTrue<string extends NonNullable<PackageType> ? true : false>;
export type DnfPackageOptional = ExpectTrue<undefined extends PackageType ? true : false>;

defineTool((install) =>
  install("dnf", {
    package: "ripgrep",
    version: "13.0.0-1.fc40",
    refresh: true,
  })
    .bin("rg")
    .sudo(),
);

expectError(() =>
  defineTool((install) =>
    install("dnf", {
      package: "ripgrep",
      unknown: "value",
    }),
  ),
);
