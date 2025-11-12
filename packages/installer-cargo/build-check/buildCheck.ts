import type { CargoInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { defineTool } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesCargo = ExpectTrue<'cargo' extends InstallMethod ? true : false>;
type CargoParams = InstallParamsRegistry['cargo'];
export type CargoParamsMatchSchema = ExpectTrue<CargoParams extends CargoInstallParams ? true : false>;
export type CargoSchemaMatchesParams = ExpectTrue<CargoInstallParams extends CargoParams ? true : false>;
defineTool((install) =>
  install('cargo', {
    crateName: 'ripgrep',
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
