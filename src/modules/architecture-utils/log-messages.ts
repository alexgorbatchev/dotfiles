import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const architectureLogMessages = {
  patternGenerationStarted: (platform: string, arch: string) =>
    createSafeLogMessage(`Generating architecture patterns for ${platform}/${arch}`),
  patternGenerationCompleted: (platform: string, arch: string) =>
    createSafeLogMessage(`Architecture patterns generated for ${platform}/${arch}`),
  regexGenerationStarted: () => createSafeLogMessage('Building architecture regex patterns'),
  regexGenerationCompleted: () => createSafeLogMessage('Architecture regex patterns built'),
  architectureDetectionStarted: (platform: string, arch: string) =>
    createSafeLogMessage(`Starting architecture detection for ${platform}/${arch}`),
  architectureDetectionCompleted: (platform: string, arch: string) =>
    createSafeLogMessage(`Architecture detection completed for ${platform}/${arch}`),
  assetMatchCheckStarted: (assetName: string) =>
    createSafeLogMessage(`Checking architecture match for asset ${assetName}`),
  assetMatchCheckCompleted: (assetName: string, systemMatch: boolean, cpuMatch: boolean, matches: boolean) =>
    createSafeLogMessage(
      `Architecture match result for ${assetName}: system=${systemMatch ? 'match' : 'no-match'}, cpu=${
        cpuMatch ? 'match' : 'no-match'
      }, overall=${matches ? 'match' : 'no-match'}`
    ),
} satisfies SafeLogMessageMap;
