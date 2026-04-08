import {
  defineTool,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
  type z_internal_ZshPluginInstallParams,
} from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

type ZshPluginInstallParams = z_internal_ZshPluginInstallParams;
type IInstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type ZshPluginParams = IInstallParamsRegistry["zsh-plugin"];
export type InstallIncludesZshPlugin = ExpectTrue<"zsh-plugin" extends InstallMethod ? true : false>;
export type ZshPluginParamsMatchSchema = ExpectTrue<ZshPluginParams extends ZshPluginInstallParams ? true : false>;
export type ZshPluginSchemaMatchesParams = ExpectTrue<ZshPluginInstallParams extends ZshPluginParams ? true : false>;
export type ZshPluginHasRepoKey = ExpectTrue<"repo" extends keyof ZshPluginParams ? true : false>;
export type ZshPluginHasUrlKey = ExpectTrue<"url" extends keyof ZshPluginParams ? true : false>;
export type ZshPluginRepoIsOptional = ExpectTrue<undefined extends ZshPluginParams["repo"] ? true : false>;
export type ZshPluginUrlIsOptional = ExpectTrue<undefined extends ZshPluginParams["url"] ? true : false>;

defineTool((install) =>
  install("zsh-plugin", {
    repo: "jeffreytse/zsh-vi-mode",
  }).zsh((shell) =>
    shell.once(/* zsh */ `
        echo "once"
      `).always(/* zsh */ `
        echo "always"
      `),
  ),
);

// Test with full git URL
defineTool((install) =>
  install("zsh-plugin", {
    repo: "https://github.com/jeffreytse/zsh-vi-mode.git",
  }),
);

// Test with optional pluginName
defineTool((install) =>
  install("zsh-plugin", {
    repo: "jeffreytse/zsh-vi-mode",
    pluginName: "zsh-vi-mode",
  }),
);

expectError(() =>
  defineTool((install) =>
    install("zsh-plugin", {
      repo: "jeffreytse/zsh-vi-mode",
      unknown: "value",
    }),
  ),
);
