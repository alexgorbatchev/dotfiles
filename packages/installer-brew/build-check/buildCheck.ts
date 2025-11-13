// @ts-nocheck
import type { BrewInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesBrew = ExpectTrue<'brew' extends InstallMethod ? true : false>;
type BrewParams = InstallParamsRegistry['brew'];
export type BrewParamsMatchSchema = ExpectTrue<BrewParams extends BrewInstallParams ? true : false>;
export type BrewSchemaMatchesParams = ExpectTrue<BrewInstallParams extends BrewParams ? true : false>;
export type BrewDisallowsUnknown = ExpectTrue<'unknown' extends keyof BrewParams ? false : true>;

defineTool((install) =>
  install('brew', {
    formula: 'ripgrep',
  }).zsh({
    shellInit: [once`echo "once"`, always`echo "always"`],
  })
);

defineTool((install) =>
  install('brew', {
    formula: 'ripgrep',
    // @ts-expect-error brew params must not accept unknown fields
    unknown: 'value',
  })
);

defineTool((install) => install('brew', {}));

export const buildCheck = true;
