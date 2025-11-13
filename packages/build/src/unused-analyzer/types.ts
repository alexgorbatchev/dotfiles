import type { SourceFile } from 'ts-morph';

export type ExportKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'variable'
  | 'enum'
  | 'namespace'
  | 'export';

export interface UnusedExportResult {
  filePath: string;
  exportName: string;
  line: number;
  kind: ExportKind;
}

export interface UnusedPropertyResult {
  filePath: string;
  typeName: string;
  propertyName: string;
  line: number;
}

export interface AnalysisResults {
  unusedExports: UnusedExportResult[];
  unusedProperties: UnusedPropertyResult[];
}

export type IsTestFileFn = (sourceFile: SourceFile) => boolean;
