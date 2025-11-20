import type { CargoInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { defineTool } from '@gitea/dotfiles';
import { expectError } from 'tsd';

type ExpectTrue<T extends true> = T;

type CargoParams = InstallParamsRegistry['cargo'];
export type InstallIncludesCargo = ExpectTrue<'cargo' extends InstallMethod ? true : false>;
export type CargoParamsMatchSchema = ExpectTrue<CargoParams extends CargoInstallParams ? true : false>;
export type CargoSchemaMatchesParams = ExpectTrue<CargoInstallParams extends CargoParams ? true : false>;

defineTool((install) =>
  install('cargo', {
    crateName: 'ripgrep',
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
    install('cargo', {
      crateName: 'ripgrep',
      unknown: 'value',
    })
  )
);
