import {
  defineTool,
  type z_internal_BrewInstallParams,
  type z_internal_IInstallParamsRegistry,
  type z_internal_InstallMethod,
} from '@alexgorbatchev/dotfiles';
import { expectError } from 'tsd';

type BrewInstallParams = z_internal_BrewInstallParams;
type IInstallParamsRegistry = z_internal_IInstallParamsRegistry;
type InstallMethod = z_internal_InstallMethod;

type ExpectTrue<T extends true> = T;

type BrewParams = IInstallParamsRegistry['brew'];
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
    install('brew', {
      formula: 'ripgrep',
      unknown: 'value',
    })
  )
);
