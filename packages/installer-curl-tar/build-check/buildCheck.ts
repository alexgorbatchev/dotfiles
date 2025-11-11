import type { CurlTarInstallParams, InstallMethod, InstallParamsMap } from '@gitea/dotfiles';
import { defineTool } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesCurlTar = ExpectTrue<'curl-tar' extends InstallMethod ? true : false>;
type CurlTarParams = InstallParamsMap['curl-tar'];
export type CurlTarParamsMatchSchema = ExpectTrue<CurlTarParams extends CurlTarInstallParams ? true : false>;
export type CurlTarSchemaMatchesParams = ExpectTrue<CurlTarInstallParams extends CurlTarParams ? true : false>;

defineTool((install) =>
  install('curl-tar', {
    url: 'https://example.com/tool.tar.gz',
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
