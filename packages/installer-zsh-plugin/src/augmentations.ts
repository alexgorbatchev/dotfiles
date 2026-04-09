import type { RegisterPluginResult } from "@dotfiles/core";
import type { IZshPluginInstallParams, ZshPluginToolConfig } from "./schemas";
import type { ZshPluginInstallResult } from "./types";

declare module "@dotfiles/core" {
  interface IInstallParamsRegistry {
    "zsh-plugin": IZshPluginInstallParams;
  }
  interface IToolConfigRegistry {
    "zsh-plugin": ZshPluginToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<"zsh-plugin", ZshPluginInstallResult> {}
}
