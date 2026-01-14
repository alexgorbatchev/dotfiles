import {
  defineTool,
  type z_internal_CargoInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from '@gitea/dotfiles';
import { expectError } from 'tsd';

type CargoInstallParams = z_internal_CargoInstallParams;
type IInstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type CargoParams = IInstallParamsRegistry['cargo'];
export type InstallIncludesCargo = ExpectTrue<'cargo' extends InstallMethod ? true : false>;
export type CargoParamsMatchSchema = ExpectTrue<CargoParams extends CargoInstallParams ? true : false>;
export type CargoSchemaMatchesParams = ExpectTrue<CargoInstallParams extends CargoParams ? true : false>;

defineTool((install) =>
  install('cargo', {
    crateName: 'ripgrep',
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
    install('cargo', {
      crateName: 'ripgrep',
      unknown: 'value',
    })
  )
);
