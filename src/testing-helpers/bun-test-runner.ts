/**
 * Development Plan for Bun Test Output Parser:
 * 
 * This module captures and processes Bun test output to provide a cleaner, more focused display.
 * The implementation has been simplified to capture full output first, then process it all at once.
 * 
 * Tasks:
 * - [X] Refactor to capture full output instead of streaming
 * - [X] Implement non-streaming parser function
 * - [X] Simplify block type detection and filtering logic
 * - [X] Maintain same functionality with simpler implementation
 * - [ ] Write tests for the module
 * - [ ] Cleanup all linting errors and warnings
 * - [ ] Cleanup all comments that are no longer relevant
 * - [ ] Ensure 100% test coverage
 * 
 * Functional Requirements:
 * 1. Skip passing tests/files
 * 2. Display failing test files and tests with their error details
 * 3. Display unhandled errors
 * 4. Filter coverage output to show only uncovered lines
 * 5. Display final summary
 */

import stripAnsi from 'strip-ansi';
import { $ } from 'zx';

const NL = '\n';

// Regexes for identifying different parts of the output
const filePathRegex = /^(src\/.*\.test\.ts):$/;
const unhandledErrorHeaderRegex = /^# Unhandled error/;
const coverageHeaderBorderRegex = /^----*\s*\|-*\s*\|-*\s*\|-*\s*$/;
const coverageHeaderTitlesRegex = /^\s*File\s*\|\s*% Funcs\s*\|\s*% Lines\s*\|\s*Uncovered Line #s\s*$/;
const summaryCountsRegex = /^\s*(\d+ pass|\d+ skip|\d+ fail|\d+ errors?|\d+ expect\(\) calls)\s*$/;
const summaryRanTestsRegex = /^Ran \d+ tests across \d+ files\. \[\d+\.\d+m?s\]$/;
const failTestRegex = /^\(fail\)\s+(.+?)(?:\s+\[\d+\.\d+m?s\])?$/;
const coverageFileLineRegex = /^\s*(All files|src\/.*?)\s*\|\s*[\d.-]+\s*\|\s*[\d.-]+\s*\|\s*([\d,-]*)\s*$/;
const summaryTestFailureBlockStartRegex = /^\d+ tests? failed:$/;
const summaryTestsSkippedBlockStartRegex = /^\d+ tests? skipped:$/;


/**
 * Processes the complete Bun test output and filters it according to the functional requirements.
 * This implementation avoids streaming and processes the entire output at once for simplicity.
 *
 * @param output The full stdout from the `bun test` command.
 * @returns A filtered string containing only the relevant test output.
 */
export function processBunTestOutput(output: string): string {
  const lines = output.split(NL);
  const result: string[] = [];
  const globallyPrintedFailingTestDetails = new Set<string>();

  let currentFileHasFailure = false;
  let currentFilePath: string | null = null;
  let currentFileHeader: string | null = null;
  let contextBuffer: string[] = [];
  let isInFinalSummaryRedundantList = false;

  for (const rawLine of lines) {
    const line = stripAnsi(rawLine).trim();

    // Detect start of redundant final summary lists and skip them
    if (summaryTestFailureBlockStartRegex.test(line) || summaryTestsSkippedBlockStartRegex.test(line)) {
      isInFinalSummaryRedundantList = true;
      continue;
    }

    if (isInFinalSummaryRedundantList) {
      // If we are in a redundant list, check if a new major section starts
      if (filePathRegex.test(line) || unhandledErrorHeaderRegex.test(line) || coverageHeaderTitlesRegex.test(line)) {
        isInFinalSummaryRedundantList = false; // Exited the redundant list
      } else {
        continue; // Skip all lines within the redundant list
      }
    }

    const isFilePath = filePathRegex.exec(line);
    if (isFilePath) {
      currentFileHasFailure = false;
      currentFilePath = isFilePath[1] as string;
      currentFileHeader = rawLine;
      contextBuffer = [];
      continue;
    }

    if (unhandledErrorHeaderRegex.test(line)) {
      result.push(rawLine);
      contextBuffer = []; // Unhandled errors are self-contained
      continue;
    }

    if (coverageHeaderTitlesRegex.test(line) || coverageHeaderBorderRegex.test(line)) {
      result.push(rawLine);
      continue;
    }

    const coverageFileMatch = coverageFileLineRegex.exec(line);
    if (coverageFileMatch) {
      const uncoveredLines = coverageFileMatch[2] ? coverageFileMatch[2].trim() : '';
      if (uncoveredLines) {
        result.push(rawLine);
      }
      continue;
    }

    if (summaryCountsRegex.test(line) || summaryRanTestsRegex.test(line)) {
        const countMatch = summaryCountsRegex.exec(line);
        if (countMatch) {
            const countText = countMatch[1];
            if (countText && !countText.startsWith('0 ')) {
                result.push(rawLine);
            }
        } else {
             result.push(rawLine);
        }
        continue;
    }

    if (line.startsWith('(pass)') || line.startsWith('(skip)')) {
      contextBuffer = []; // Reset context for passing/skipped tests
      continue;
    }

    if (line.startsWith('(fail)')) {
      const failMatch = failTestRegex.exec(line);
      const testDescription = failMatch && failMatch[1] ? failMatch[1].trim() : `raw:${line.substring(0, 50)}`;
      const detailKey = `${currentFilePath || 'unknown-file'}::${testDescription}`;

      if (!globallyPrintedFailingTestDetails.has(detailKey)) {
        if (!currentFileHasFailure && currentFileHeader) {
          result.push(currentFileHeader);
          currentFileHasFailure = true;
        }
        result.push(...contextBuffer, rawLine);
        globallyPrintedFailingTestDetails.add(detailKey);
      }
      contextBuffer = [];
    } else {
      // Any other line is considered context for a potential failure.
      contextBuffer.push(rawLine);
    }
  }

  return result.join(NL);
}


async function main() {
  const args = process.argv.slice(2);
  const bunArgs = args.filter(arg => arg !== '--watch');

  try {
    const { stdout, stderr } = await $`bun test --colors ${bunArgs}`.nothrow();
    
    // Combine stdout and stderr to ensure all output is processed
    const combinedOutput = stdout + stderr;
    const processedOutput = processBunTestOutput(combinedOutput);
    
    process.stdout.write(processedOutput);

  } catch (error: any) {
    // This catch block might be redundant with nothrow(), but it's good for safety.
    console.error('Bun Test Runner Script Error:', error.stack || error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("Unhandled error in main:", err);
    process.exit(1);
  });
}
