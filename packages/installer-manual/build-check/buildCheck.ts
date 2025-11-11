import type { InstallMethod, InstallParamsMap, ManualInstallParams } from '@gitea/dotfiles';
import { defineTool } from '@gitea/dotfiles';

type ExpectTrue<T extends true> = T;

export type InstallIncludesManual = ExpectTrue<'manual' extends InstallMethod ? true : false>;
type ManualParams = InstallParamsMap['manual'];
export type ManualParamsMatchSchema = ExpectTrue<ManualParams extends ManualInstallParams ? true : false>;
export type ManualSchemaMatchesParams = ExpectTrue<ManualInstallParams extends ManualParams ? true : false>;

defineTool((install) => install('manual', {}));

defineTool((install) =>
  install('manual', {
    binaryPath: 'bin/tool',
  })
);

defineTool((install) =>
  install('manual', {
    binaryPath: 'bin/tool',
    // @ts-expect-error manual params must not accept unknown fields
    unknown: 'value',
  })
);

export const buildCheck = true;
