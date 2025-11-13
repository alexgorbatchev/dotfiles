// @ts-nocheck
import type { CurlTarInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesCurlTar = ExpectTrue<'curl-tar' extends InstallMethod ? true : false>;
type CurlTarParams = InstallParamsRegistry['curl-tar'];
export type CurlTarParamsMatchSchema = ExpectTrue<CurlTarParams extends CurlTarInstallParams ? true : false>;
export type CurlTarSchemaMatchesParams = ExpectTrue<CurlTarInstallParams extends CurlTarParams ? true : false>;

defineTool((install) =>
  install('curl-tar', {
    url: 'https://example.com/tool.tar.gz',
  })
    .zsh({
      scripts: [once`echo "once"`, always`echo "always"`],
    })
);

defineTool((install) =>
  install('curl-tar', {
    url: 'https://example.com/tool.tar.gz',
    // @ts-expect-error curl-tar params must not accept unknown fields
    unknown: 'value',
  })
);

export const buildCheck = true;
