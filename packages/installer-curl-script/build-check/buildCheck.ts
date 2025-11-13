// @ts-nocheck
import type { CurlScriptInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesCurlScript = ExpectTrue<'curl-script' extends InstallMethod ? true : false>;
type CurlScriptParams = InstallParamsRegistry['curl-script'];
export type CurlScriptParamsMatchSchema = ExpectTrue<CurlScriptParams extends CurlScriptInstallParams ? true : false>;
export type CurlScriptSchemaMatchesParams = ExpectTrue<CurlScriptInstallParams extends CurlScriptParams ? true : false>;
export type CurlScriptRequiresUrl = ExpectTrue<'url' extends keyof CurlScriptParams ? true : false>;

defineTool((install) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
  })
    .zsh({
      scripts: [once`echo "once"`, always`echo "always"`],
    })
);

defineTool((install) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
    // @ts-expect-error curl-script params must not accept unknown fields
    unknown: 'value',
  })
);

export const buildCheck = true;
