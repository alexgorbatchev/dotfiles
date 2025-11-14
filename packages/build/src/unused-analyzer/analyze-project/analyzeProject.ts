import path from 'node:path';
import { Project } from 'ts-morph';
import type { AnalysisResults, IsTestFileFn, UnusedExportResult, UnusedPropertyResult } from '../types';
import { findUnusedExports } from './findUnusedExports';
import { findUnusedProperties } from './findUnusedProperties';
import { hasNoCheck } from './hasNoCheck';
import { isTestFile as defaultIsTestFile } from './isTestFile';

export function analyzeProject(
  tsConfigPath: string,
  onProgress?: (current: number, total: number, filePath: string) => void,
  targetFilePath?: string,
  isTestFile: IsTestFileFn = defaultIsTestFile
): AnalysisResults {
  const project: Project = new Project({
    tsConfigFilePath: tsConfigPath,
  });

  const tsConfigDir: string = path.dirname(tsConfigPath);

  // Get total file count for progress reporting
  const allSourceFiles = project.getSourceFiles();
  const filesToAnalyze = allSourceFiles.filter((sf) => {
    if (isTestFile(sf)) {
      return false;
    }
    if (hasNoCheck(sf)) {
      return false;
    }
    if (targetFilePath && sf.getFilePath() !== targetFilePath) {
      return false;
    }
    return true;
  });
  const totalFiles: number = filesToAnalyze.length;

  let currentFile = 0;
  const filesProcessed = new Set<string>();
  const progressCallback = onProgress
    ? (filePath: string) => {
        // Only increment once per file (called from both exports and properties analysis)
        if (!filesProcessed.has(filePath)) {
          filesProcessed.add(filePath);
          currentFile++;
          onProgress(currentFile, totalFiles, filePath);
        }
      }
    : undefined;

  const unusedExports: UnusedExportResult[] = findUnusedExports(
    project,
    tsConfigDir,
    isTestFile,
    progressCallback,
    targetFilePath
  );
  const unusedProperties: UnusedPropertyResult[] = findUnusedProperties(
    project,
    tsConfigDir,
    isTestFile,
    progressCallback,
    targetFilePath
  );

  const results: AnalysisResults = {
    unusedExports,
    unusedProperties,
  };

  return results;
}
