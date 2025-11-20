import type { CurlTarInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { defineTool } from '@gitea/dotfiles';
import { expectError } from 'tsd';

type ExpectTrue<T extends true> = T;

type CurlTarParams = InstallParamsRegistry['curl-tar'];
export type InstallIncludesCurlTar = ExpectTrue<'curl-tar' extends InstallMethod ? true : false>;
export type CurlTarParamsMatchSchema = ExpectTrue<CurlTarParams extends CurlTarInstallParams ? true : false>;
export type CurlTarSchemaMatchesParams = ExpectTrue<CurlTarInstallParams extends CurlTarParams ? true : false>;

defineTool((install) =>
  install('curl-tar', {
    url: 'https://example.com/tool.tar.gz',
  }).zsh((shell) =>
    shell
      .once(/* zsh */ `
        echo "once"
      `)
      .always(/* zsh */ `
        echo "always"
      `)
  )
);

expectError(() =>
  defineTool((install) =>
    install('curl-tar', {
      url: 'https://example.com/tool.tar.gz',
      unknown: 'value',
    })
  )
);
