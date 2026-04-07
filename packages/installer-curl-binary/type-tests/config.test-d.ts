import {
  defineTool,
  type z_internal_CurlBinaryInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from '@alexgorbatchev/dotfiles';
import { expectError } from 'tsd';

type CurlBinaryInstallParams = z_internal_CurlBinaryInstallParams;
type IInstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type CurlBinaryParams = IInstallParamsRegistry['curl-binary'];
export type InstallIncludesCurlBinary = ExpectTrue<'curl-binary' extends InstallMethod ? true : false>;
export type CurlBinaryParamsMatchSchema = ExpectTrue<CurlBinaryParams extends CurlBinaryInstallParams ? true : false>;
export type CurlBinarySchemaMatchesParams = ExpectTrue<CurlBinaryInstallParams extends CurlBinaryParams ? true : false>;

defineTool((install) =>
  install('curl-binary', {
    url: 'https://example.com/tool-binary',
  }).zsh((shell) =>
    shell.once(/* zsh */ `
        echo "once"
      `).always(/* zsh */ `
        echo "always"
      `)
  )
);

expectError(() =>
  defineTool((install) =>
    install('curl-binary', {
      url: 'https://example.com/tool-binary',
      unknown: 'value',
    })
  )
);
