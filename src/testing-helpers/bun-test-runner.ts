import stripAnsi from 'strip-ansi';
import { $ } from 'zx';

const NL = '\n';

// Regexes for identifying different parts of the output
const filePathRegex = /^(src\/.*\.test\.ts):$/;
const unhandledErrorHeaderRegex = /^# Unhandled error/;
const unhandledErrorSeparatorRegex = /^-+$/;
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
  let isInCoverageSection = false;

  // Use a traditional for loop with index to handle unhandled errors properly
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    
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

    // Detect coverage section start
    if (coverageHeaderTitlesRegex.test(line)) {
      isInCoverageSection = true;
    // Add the coverage report header
    result.push(''); // Add a blank line before the header
    result.push('Coverage Report (file_name:uncovered_lines):');
      continue;
    }

    // Skip coverage header border
    if (coverageHeaderBorderRegex.test(line)) {
      continue;
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
      // Add the unhandled error header
      result.push(rawLine);
      
      // Capture all lines until we reach another separator line
      let nextIndex = i + 1;
      let errorContent = [];
      
      // First line after the header should be a separator
      if (nextIndex < lines.length) {
        const separatorLine = lines[nextIndex];
        if (separatorLine && unhandledErrorSeparatorRegex.test(stripAnsi(separatorLine).trim())) {
          result.push("---"); // Use standardized separator
          nextIndex++;
        }
      }
      
      // Collect all content until the next separator
      while (nextIndex < lines.length) {
        const nextLine = lines[nextIndex];
        if (nextLine === undefined) break;
        
        const errorLine = stripAnsi(nextLine).trim();
        
        // If we find another separator line, add a standardized separator and break
        if (unhandledErrorSeparatorRegex.test(errorLine)) {
          // Add all collected error content
          result.push(...errorContent);
          result.push("---");
          nextIndex++;
          break;
        }
        
        // Collect the error line
        errorContent.push(nextLine);
        nextIndex++;
      }
      
      // Skip the lines we've already processed
      i = nextIndex - 1; // -1 because the loop will increment i
      contextBuffer = []; // Unhandled errors are self-contained
      continue;
    }

    const coverageFileMatch = coverageFileLineRegex.exec(line);
    if (coverageFileMatch && isInCoverageSection) {
      const fileName = coverageFileMatch[1] ? coverageFileMatch[1].trim() : '';
      const uncoveredLines = coverageFileMatch[2] ? coverageFileMatch[2].trim() : '';
      
      // Only collect files with uncovered lines and skip "All files" summary
      if (uncoveredLines && fileName !== 'All files') {
        result.push(`- ${fileName}:${uncoveredLines}`);
      }
      continue;
    }
    if (!coverageFileMatch && isInCoverageSection) {
      result.push("");
      isInCoverageSection = false;
    }

    // Collect summary statistics to add after coverage report
    if (summaryCountsRegex.test(line) || summaryRanTestsRegex.test(line)) {
      // Store these lines to add after the coverage report
      contextBuffer.push(rawLine);
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
      const isExtraNewLine = rawLine.trim() === "" && (contextBuffer[contextBuffer.length - 1] || '').trim() === "";
      if (!isExtraNewLine) {
        contextBuffer.push(rawLine);
      }
    }
  }

  // Add the collected summary statistics after the coverage report
  result.push(...contextBuffer);

  return result.join(NL);
}


async function main() {
  const args = process.argv.slice(2);
  const bunArgs = args.filter(arg => arg !== '--watch');

  console.log('Running bun test with args:', bunArgs.join(' '));

  try {
    const $$ = $({
      env: {
        ...process.env,
        BUN_CORRECT_TEST_COMMAND: '1',
      },
      cwd: process.cwd(),
    });   
    const { stdout, stderr } = await $$`bun test ${bunArgs}`.nothrow().quiet();
    
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
