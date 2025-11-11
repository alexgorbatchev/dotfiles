import type { CurlScriptInstallParams, InstallMethod, InstallParamsMap } from '@gitea/dotfiles';
import { defineTool } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesCurlScript = ExpectTrue<'curl-script' extends InstallMethod ? true : false>;
type CurlScriptParams = InstallParamsMap['curl-script'];
export type CurlScriptParamsMatchSchema = ExpectTrue<CurlScriptParams extends CurlScriptInstallParams ? true : false>;
export type CurlScriptSchemaMatchesParams = ExpectTrue<CurlScriptInstallParams extends CurlScriptParams ? true : false>;
export type CurlScriptRequiresUrl = ExpectTrue<'url' extends keyof CurlScriptParams ? true : false>;

defineTool((install) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
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
