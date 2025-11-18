import type { CargoInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';
import { expectError } from 'tsd';

type ExpectTrue<T extends true> = T;

type CargoParams = InstallParamsRegistry['cargo'];
export type InstallIncludesCargo = ExpectTrue<'cargo' extends InstallMethod ? true : false>;
export type CargoParamsMatchSchema = ExpectTrue<CargoParams extends CargoInstallParams ? true : false>;
export type CargoSchemaMatchesParams = ExpectTrue<CargoInstallParams extends CargoParams ? true : false>;

defineTool((install) =>
  install('cargo', {
    crateName: 'ripgrep',
  }).zsh({
    shellInit: [once`echo "once"`, always`echo "always"`],
  })
);

expectError(() =>
  defineTool((install) =>
    install('cargo', {
      crateName: 'ripgrep',
      unknown: 'value',
    })
  )
);
