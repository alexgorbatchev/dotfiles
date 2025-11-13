// @ts-nocheck
import type { CargoInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesCargo = ExpectTrue<'cargo' extends InstallMethod ? true : false>;
type CargoParams = InstallParamsRegistry['cargo'];
export type CargoParamsMatchSchema = ExpectTrue<CargoParams extends CargoInstallParams ? true : false>;
export type CargoSchemaMatchesParams = ExpectTrue<CargoInstallParams extends CargoParams ? true : false>;
defineTool((install) =>
  install('cargo', {
    crateName: 'ripgrep',
  }).zsh({
    shellInit: [once`echo "once"`, always`echo "always"`],
  })
);

defineTool((install) =>
  install('cargo', {
    crateName: 'ripgrep',
    // @ts-expect-error cargo params must not accept unknown fields
    unknown: 'value',
  })
);

export const buildCheck = true;
