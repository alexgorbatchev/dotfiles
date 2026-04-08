import {
  defineTool,
  type z_internal_CurlScriptInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type CurlScriptInstallParams = z_internal_CurlScriptInstallParams;
type InstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type CurlScriptParams = InstallParamsRegistry["curl-script"];
export type InstallIncludesCurlScript = ExpectTrue<"curl-script" extends InstallMethod ? true : false>;
export type CurlScriptParamsMatchSchema = ExpectTrue<CurlScriptParams extends CurlScriptInstallParams ? true : false>;
export type CurlScriptSchemaMatchesParams = ExpectTrue<CurlScriptInstallParams extends CurlScriptParams ? true : false>;
export type CurlScriptRequiresUrl = ExpectTrue<"url" extends keyof CurlScriptParams ? true : false>;
export type CurlScriptUrlIsRequired = ExpectTrue<
  Pick<CurlScriptParams, "url"> extends { url: CurlScriptParams["url"] } ? true : false
>;

defineTool((install) =>
  install("curl-script", {
    url: "https://example.com/install.sh",
    shell: "bash",
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
    install("curl-script", {
      url: "https://example.com/install.sh",
      shell: "bash",
      unknown: "value",
    }),
  ),
);
