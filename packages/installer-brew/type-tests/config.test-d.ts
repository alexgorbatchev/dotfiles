import type { BrewInstallParams, InstallMethod, InstallParamsRegistry } from '@gitea/dotfiles';
import { always, defineTool, once } from '@gitea/dotfiles';
import { expectError } from 'tsd';

type ExpectTrue<T extends true> = T;

type BrewParams = InstallParamsRegistry['brew'];
type UnknownKeyCheck = 'unknown' extends keyof BrewParams ? true : false;
type FormulaType = BrewParams['formula'];
export type InstallIncludesBrew = ExpectTrue<'brew' extends InstallMethod ? true : false>;
export type BrewParamsMatchSchema = ExpectTrue<BrewParams extends BrewInstallParams ? true : false>;
export type BrewSchemaMatchesParams = ExpectTrue<BrewInstallParams extends BrewParams ? true : false>;
export type BrewDisallowsUnknown = ExpectTrue<UnknownKeyCheck extends false ? true : false>;
export type BrewFormulaAcceptsString = ExpectTrue<string extends NonNullable<FormulaType> ? true : false>;
export type BrewFormulaOptional = ExpectTrue<undefined extends FormulaType ? true : false>;

defineTool((install) =>
  install('brew', {
    formula: 'ripgrep',
  }).zsh({
    shellInit: [once`echo "once"`, always`echo "always"`],
  })
);

expectError(() =>
  defineTool((install) =>
    install('brew', {
      formula: 'ripgrep',
      unknown: 'value',
    })
  )
);
