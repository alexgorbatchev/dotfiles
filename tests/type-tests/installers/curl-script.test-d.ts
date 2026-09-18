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

// Every parameter the Go installer reads, with args and env in both static and
// dynamic form.
defineTool((install) =>
  install("curl-script", {
    url: "https://fnm.vercel.app/install",
    shell: "bash",
    args: ["--skip-shell", "--install-dir", "{stagingDir}"],
    env: { INSTALL_DIR: "~/.local/bin" },
    versionArgs: ["--version"],
    versionRegex: /fnm (\d+\.\d+\.\d+)/,
    auto: true,
  }).bin("fnm"),
);

defineTool((install) =>
  install("curl-script", {
    url: "https://fly.io/install.sh",
    shell: "sh",
    args: (ctx) => ["--install-dir", ctx.stagingDir],
    env: (ctx) => ({ FLYCTL_INSTALL: ctx.stagingDir }),
    versionArgs: "version",
    versionRegex: "v(\\d+\\.\\d+\\.\\d+)",
  }).bin("flyctl"),
);

// The interpreter defaults to sh when omitted.
defineTool((install) => install("curl-script", { url: "https://example.com/install.sh" }).bin("tool"));

expectError(() =>
  defineTool((install) =>
    install("curl-script", {
      url: "https://example.com/install.sh",
      shell: "bash",
      unknown: "value",
    }),
  ),
);

// The runtime runs bash when asked for bash and sh otherwise, so no third interpreter
// can be selected.
expectError(() => defineTool((install) => install("curl-script", { url: "https://example.com/i.sh", shell: "zsh" })));
