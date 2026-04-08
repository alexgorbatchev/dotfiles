import {
  defineTool,
  type z_internal_CurlTarInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type CurlTarInstallParams = z_internal_CurlTarInstallParams;
type IInstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type CurlTarParams = IInstallParamsRegistry["curl-tar"];
export type InstallIncludesCurlTar = ExpectTrue<"curl-tar" extends InstallMethod ? true : false>;
export type CurlTarParamsMatchSchema = ExpectTrue<CurlTarParams extends CurlTarInstallParams ? true : false>;
export type CurlTarSchemaMatchesParams = ExpectTrue<CurlTarInstallParams extends CurlTarParams ? true : false>;

defineTool((install) =>
  install("curl-tar", {
    url: "https://example.com/tool.tar.gz",
  }).zsh((shell) =>
    shell.once(/* zsh */ `
        echo "once"
      `).always(/* zsh */ `
        echo "always"
      `),
  ),
);

expectError(() =>
  defineTool((install) =>
    install("curl-tar", {
      url: "https://example.com/tool.tar.gz",
      unknown: "value",
    }),
  ),
);
