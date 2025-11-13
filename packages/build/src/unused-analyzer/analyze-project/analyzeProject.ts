import path from 'node:path';
import { Project } from 'ts-morph';
import type { AnalysisResults, IsTestFileFn, UnusedExportResult, UnusedPropertyResult } from '../types';
import { findUnusedExports } from './findUnusedExports';
import { findUnusedProperties } from './findUnusedProperties';
import { isTestFile as defaultIsTestFile } from './isTestFile';

export function analyzeProject(
  tsConfigPath: string,
  onProgress?: (filePath: string) => void,
  targetFilePath?: string,
  isTestFile: IsTestFileFn = defaultIsTestFile
): AnalysisResults {
  const project: Project = new Project({
    tsConfigFilePath: tsConfigPath,
  });

  const tsConfigDir: string = path.dirname(tsConfigPath);

  const unusedExports: UnusedExportResult[] = findUnusedExports(
    project,
    tsConfigDir,
    isTestFile,
    onProgress,
    targetFilePath
  );
  const unusedProperties: UnusedPropertyResult[] = findUnusedProperties(
    project,
    tsConfigDir,
    isTestFile,
    onProgress,
    targetFilePath
  );

  const results: AnalysisResults = {
    unusedExports,
    unusedProperties,
  };

  return results;
}
