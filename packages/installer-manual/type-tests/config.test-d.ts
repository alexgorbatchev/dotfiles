import type { InstallMethod, InstallParamsRegistry, ManualInstallParams } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';
import { expectError } from 'tsd';

type ExpectTrue<T extends true> = T;

type ManualParams = InstallParamsRegistry['manual'];
export type InstallIncludesManual = ExpectTrue<'manual' extends InstallMethod ? true : false>;
export type ManualParamsMatchSchema = ExpectTrue<ManualParams extends ManualInstallParams ? true : false>;
export type ManualSchemaMatchesParams = ExpectTrue<ManualInstallParams extends ManualParams ? true : false>;

defineTool((install) =>
  install('manual', {}).zsh({
    shellInit: [once`echo "once"`, always`echo "always"`],
  })
);

defineTool((install) =>
  install('manual', {
    binaryPath: 'bin/tool',
  })
);

expectError(() =>
  defineTool((install) =>
    install('manual', {
      binaryPath: 'bin/tool',
      unknown: 'value',
    })
  )
);
