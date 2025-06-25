/**
 * Functional Requirements for Bun Test Output Parser:
 *
 * TODO:
 * - [X] Verify and fix: Ensure redundant final summary sections (e.g., "N tests failed:" followed by test list) are completely ignored and do not cause failing tests to be attributed to incorrect files or duplicated. Specifically, check `same-file--one-failing` and `same-file--two-failing` snapshot outputs. (Verified 2025-06-24)
 * - [X] Re-verify all filtering for FILE_TEST_RESULTS (passing, failing, stack traces). (Verified 2025-06-24)
 * - [X] Re-verify all filtering for COVERAGE_SUMMARY (headers, borders, uncovered lines). (Verified 2025-06-24)
 * - [X] Re-verify all filtering for FINAL_SUMMARY (zero counts, specific lines). (Verified 2025-06-24)
 *
 * 1.  **Skip Passing Tests/Files**: The parser must suppress output for test files and individual tests that pass successfully.
 * 2.  **Display Failing Test Files and Tests**:
 *     - If a file contains one or more failing tests, its file path header (e.g., `src/path/to/file.test.ts:`) must be displayed once.
 *     - For each failing test, its `(fail)` line must be displayed.
 *     - All subsequent lines related to a failing test (code snippets, error messages, stack traces) must be displayed until a new test result or section begins.
 * 3.  **Display Unhandled Errors**: Any "Unhandled error between tests" blocks, including their headers, separators, and full error details, must be displayed.
 * 4.  **Filter Coverage Output**:
 *     - Only display the coverage table headers and borders.
 *     - For individual files in the coverage summary, only display lines where the "Uncovered Line #s" column is not empty.
 *     - The "All files" summary line in the coverage report should only be displayed if it has specific "Uncovered Line #s" listed.
 * 5.  **Display Final Summary**: The final test run summary lines (e.g., "X pass", "Y fail", "Z expect() calls", "Ran N tests...") must be displayed.
 *
 * Current Status:
 * - Reverting to a simpler base to diagnose over-filtering.
 */

import { Transform, type TransformCallback, type TransformOptions } from 'stream';
import stripAnsi from 'strip-ansi';
import { $ } from 'zx';

const NL = '\n';

enum BlockType {
  UNKNOWN,
  FILE_TEST_RESULTS,
  UNHANDLED_ERROR,
  COVERAGE_SUMMARY,
  FINAL_SUMMARY, // For actual summary counts like "X pass", "Ran N tests"
  FINAL_SUMMARY_REDUNDANT_LIST, // For "N tests failed:", "N tests skipped:" headers
  FINAL_SUMMARY_REDUNDANT_LIST_ITEM_FILE, // For file paths within those redundant lists
  FINAL_SUMMARY_REDUNDANT_LIST_ITEM_TEST, // For (fail)/(skip) lines within those redundant lists
  IGNORED_TEST_RESULT, // For general (pass) or (skip) lines that should be filtered out
}

// Basic Regexes for block identification
const filePathRegex = /^(src\/.*\.test\.ts):$/;
const unhandledErrorHeaderRegex = /^# Unhandled error/;
const coverageHeaderBorderRegex = /^----*\s*\|-*\s*\|-*\s*\|-*\s*$/;
const coverageHeaderTitlesRegex = /^\s*File\s*\|\s*% Funcs\s*\|\s*% Lines\s*\|\s*Uncovered Line #s\s*$/;
const summaryCountsRegex = /^\s*(\d+ pass|\d+ skip|\d+ fail|\d+ errors?|\d+ expect\(\) calls)\s*$/;
const summaryRanTestsRegex = /^Ran \d+ tests across \d+ files\. \[\d+\.\d+m?s\]$/;

// Regexes for detailed parsing (will be re-introduced carefully)
const passTestRegex = /^\(pass\)\s+(.+?)\s+\[\d+\.\d+m?s\]$/; // Kept for potential future use, though (pass) is now by startsWith
const skipTestRegex = /^\(skip\)\s+(.+?)\s+\[\d+\.\d+m?s\]$/; // Kept for potential future use, though (skip) is now by startsWith
const failTestRegex = /^\(fail\)\s+(.+?)(?:\s+\[\d+\.\d+m?s\])?$/; // Timing part is now optional
const errorContextLineRegex = /^\s*\d+\s*\|/;
const errorMessageBlockRegex = /^\s*error:\s+/;
const stackTraceLineRegex = /^\s*at\s+/;
const coverageFileLineRegex = /^\s*(All files|src\/.*?)\s*\|\s*[\d.-]+\s*\|\s*[\d.-]+\s*\|\s*([\d,-]*)\s*$/; // Relaxed for now
const summaryTestsSkippedBlockStartRegex = /^\d+ tests? skipped:$/;
const summaryTestFailureBlockStartRegex = /^\d+ tests? failed:$/;


export class BunTestOutputParser extends Transform {
  private currentBlockType: BlockType = BlockType.UNKNOWN;
  private currentBlockLines: string[] = [];
  private currentFilePathForBlock: string | null = null;
  private currentFileRawPathLineForBlock: string | null = null;
  private hasPrintedFileHeaderInCurrentBlock: boolean = false;
  private globallyPrintedFailingTestDetails = new Set<string>();
  private isInFinalSummarySection: boolean = false; // Will be re-introduced carefully

  constructor(options?: TransformOptions) {
    super({ ...options, writableObjectMode: true });
  }

  private determineBlockType(line: string): BlockType {
    // Order matters for some regexes
    if (summaryTestFailureBlockStartRegex.test(line) || summaryTestsSkippedBlockStartRegex.test(line)) {
      return BlockType.FINAL_SUMMARY_REDUNDANT_LIST;
    }

    if (filePathRegex.test(line)) {
      // If we are already in the final summary section (e.g. after "N tests failed:"),
      // then a file path here is part of that redundant list, not a new test file block.
      return this.isInFinalSummarySection ? BlockType.FINAL_SUMMARY_REDUNDANT_LIST_ITEM_FILE : BlockType.FILE_TEST_RESULTS;
    }

    if (unhandledErrorHeaderRegex.test(line)) return BlockType.UNHANDLED_ERROR;
    if (coverageHeaderBorderRegex.test(line) || coverageHeaderTitlesRegex.test(line)) {
      return BlockType.COVERAGE_SUMMARY;
    }

    // If currently in a coverage summary, check for coverage file lines to continue the block
    if (this.currentBlockType === BlockType.COVERAGE_SUMMARY && coverageFileLineRegex.test(line)) {
      return BlockType.COVERAGE_SUMMARY;
    }

    // If currently in FILE_TEST_RESULTS, certain lines should continue this block
    if (this.currentBlockType === BlockType.FILE_TEST_RESULTS) {
      if (
        line.startsWith('(pass)') ||
        line.startsWith('(skip)') ||
        line.startsWith('(fail)') ||
        errorContextLineRegex.test(line) ||
        errorMessageBlockRegex.test(line) ||
        stackTraceLineRegex.test(line)
      ) {
        return BlockType.FILE_TEST_RESULTS;
      }
    }
    
    // These are the true final summary lines (counts, ran tests)
    if (summaryCountsRegex.test(line) || summaryRanTestsRegex.test(line)) {
      return BlockType.FINAL_SUMMARY;
    }

    // If we are in the final summary section and encounter a (fail) or (skip) line,
    // it's part of the redundant list.
    if (this.isInFinalSummarySection && (line.startsWith('(fail)') || line.startsWith('(skip)'))) {
        return BlockType.FINAL_SUMMARY_REDUNDANT_LIST_ITEM_TEST;
    }

    // General (pass) or (skip) lines (that didn't continue a FILE_TEST_RESULTS block)
    // should be ignored if not part of a specific block type handled above.
    if (line.startsWith('(pass)') || line.startsWith('(skip)')) {
      return BlockType.IGNORED_TEST_RESULT;
    }
    
    // If none of the above, it's UNKNOWN. It might continue a current block,
    // or be an interstitial line. _transform handles appending to currentBlockLines.
    return BlockType.UNKNOWN;
  }

  private processCurrentBlockAndClear(nextBlockType?: BlockType): void {
    switch (this.currentBlockType) {
      case BlockType.FILE_TEST_RESULTS: {
        // console.log(`>>> Processing FILE_TEST_RESULTS for: ${this.currentFilePathForBlock || 'Unknown File'}`);
        // console.log(`>>> Raw header line: ${this.currentFileRawPathLineForBlock}`);
        // console.log(`>>> Lines in block: ${this.currentBlockLines.length}`);
        // this.currentBlockLines.forEach((l, idx) => console.log(`  Line ${idx}: ${stripAnsi(l).trim()}`));

        let potentialErrorContextBuffer: string[] = [];
        let headerPrintedForThisFileBlock = false; // Local flag for this specific block processing

        for (const rawLine of this.currentBlockLines) {
          let line = stripAnsi(rawLine).trim(); // Trim whitespace, including potential \r
          if (line.startsWith('\ufeff')) { // Check for and remove BOM
            line = line.substring(1);
          }

          // filePathRegex lines are typically the start of this block, handled by _transform.
          // If one appears mid-block, it implies an issue with block segmentation or an unexpected format.
          // For safety, if we see one, we assume it's not part of current test's context.
          if (filePathRegex.test(line)) {
            potentialErrorContextBuffer = []; // Clear context as it might belong to a previous test in a malformed block
            continue;
          }

          // More robust check for skipping pass/skip lines
          if (line.startsWith('(pass)') || line.startsWith('(skip)')) {
            potentialErrorContextBuffer = []; // Clear context, it was for a passing/skipped test
            continue; // Don't print pass/skip lines
          }

          if (line.startsWith('(fail)')) { // More robust check for fail lines
            const failMatch = line.match(failTestRegex); // Attempt to get description
            // If regex fails to capture description, use a sanitized version of the line itself for uniqueness
            const testDescription = failMatch && failMatch[1] ? failMatch[1].trim() : `raw:${line.substring(0, 50)}`;
            const detailKey = `${this.currentFilePathForBlock || 'unknown-file'}::${testDescription}`;

            if (!this.globallyPrintedFailingTestDetails.has(detailKey)) {
              // console.log(`  Printing fail: ${detailKey}`);
              if (!headerPrintedForThisFileBlock && this.currentFileRawPathLineForBlock) {
                // console.log(`    Printing header: ${this.currentFileRawPathLineForBlock}`);
                // For FILE_TEST_RESULTS header, do NOT unescape.
                this.push(this.currentFileRawPathLineForBlock + NL);
                headerPrintedForThisFileBlock = true;
              }
              // console.log(`    Printing ${potentialErrorContextBuffer.length} context lines.`);
              potentialErrorContextBuffer.forEach(ctxLine => {
                // For FILE_TEST_RESULTS context, do NOT unescape.
                this.push(ctxLine + NL);
              });
              // console.log(`    Printing fail line: ${rawLine}`);
              // For FILE_TEST_RESULTS (fail) line, do NOT unescape.
              this.push(rawLine + NL);

              this.globallyPrintedFailingTestDetails.add(detailKey);
            } else {
              // console.log(`  Skipping duplicate fail: ${detailKey}`);
            }
            potentialErrorContextBuffer = []; // Clear buffer after handling a fail line (printed or duplicate)
          } else {
            // This means it's context for a (potential) subsequent fail.
            potentialErrorContextBuffer.push(rawLine);
          }
          // Note: The 'continue' statements for filePathRegex, pass, and skip ensure those lines
          // are not added to potentialErrorContextBuffer here.
        }
        // Any remaining lines in potentialErrorContextBuffer that followed the last test outcome
        // should be printed if the file header was printed (i.e., if there was a failure).
        if (headerPrintedForThisFileBlock && potentialErrorContextBuffer.length > 0) {
          if (nextBlockType === BlockType.UNHANDLED_ERROR) {
            // If followed by unhandled error, print all, including trailing empty lines.
            // These lines are part of FILE_TEST_RESULTS but precede an UNHANDLED_ERROR.
            // Reverting to push ctxLine directly as per feedback.
            potentialErrorContextBuffer.forEach(ctxLine => {
              this.push(ctxLine + NL);
            });
          } else {
            // Otherwise, print context but avoid trailing empty lines.
            let lastNonEmptyIndex = -1;
            for (let i = potentialErrorContextBuffer.length - 1; i >= 0; i--) {
              if (potentialErrorContextBuffer[i]?.trim() !== '') {
                lastNonEmptyIndex = i;
                break;
              }
            }
            for (let i = 0; i <= lastNonEmptyIndex; i++) {
              const lineFromArray = potentialErrorContextBuffer[i];
              // Ensure lineFromArray is treated as a string, defaulting to empty if undefined/null
              const lineToProcess = typeof lineFromArray === 'string' ? lineFromArray : '';
              // Reverting to push lineToProcess directly as per feedback.
              this.push(lineToProcess + NL);
            }
          }
        }
        potentialErrorContextBuffer = []; // Ensure buffer is always cleared
        break;
      }
      case BlockType.UNHANDLED_ERROR:
        // Print all lines for unhandled errors, ensuring they are cleaned
        this.currentBlockLines.forEach(rawLine => {
          let line = stripAnsi(rawLine).trim(); // Trim whitespace
          if (line.startsWith('\ufeff')) { // Check for and remove BOM
            line = line.substring(1);
          }
          // Push the original rawLine to preserve any leading/trailing whitespace
          // or ANSI codes if that's what the snapshot expects.
          // The snapshot seems to expect raw lines for unhandled errors, but unescaped if needed.

          // Reverting to push rawLine directly as per feedback.
          this.push(rawLine + NL);
        });
        break;
      case BlockType.COVERAGE_SUMMARY: {
        for (const rawLine of this.currentBlockLines) {
          let line = stripAnsi(rawLine).trim(); // Trim whitespace, including potential \r
          if (line.startsWith('\ufeff')) { // Check for and remove BOM
            line = line.substring(1);
          }
          if (coverageHeaderBorderRegex.test(line) || coverageHeaderTitlesRegex.test(line)) {
            this.push(rawLine + NL);
            continue;
          }
          const fileMatch = line.match(coverageFileLineRegex);
          if (fileMatch) {
            const fileName = fileMatch[1];
            const uncoveredLines = fileMatch[2] ? fileMatch[2].trim() : '';
            if (uncoveredLines !== '') {
              this.push(rawLine + NL);
            } else if (fileName === 'All files' && uncoveredLines === '') {
              // Special case: if "All files" has no uncovered lines, we still might want to print it
              // if other files had uncovered lines. For now, let's be strict: only print if it has uncovered lines.
              // This can be adjusted if the user wants to see "All files" even if it's clean but other files are not.
              // Based on current requirement: "The "All files" summary line ... should only be displayed if it has specific "Uncovered Line #s" listed."
              // So, if uncoveredLines is empty for "All files", we skip it.
            }
          }
          // Other lines within a coverage block that don't match are ignored.
        }
        break;
      }
      case BlockType.FINAL_SUMMARY: {
        for (const rawLine of this.currentBlockLines) {
          let line = stripAnsi(rawLine).trim(); // Trim whitespace, including potential \r
          if (line.startsWith('\ufeff')) { // Check for and remove BOM
            line = line.substring(1);
          }
          if (summaryRanTestsRegex.test(line) || line.includes('expect() calls')) {
            this.push(rawLine + NL);
            continue;
          }
          const countsMatch = line.match(summaryCountsRegex);
          if (countsMatch) {
            const countText = countsMatch[1]; // e.g., "0 pass", "1 fail"
            if (countText && !countText.startsWith('0 ')) { // Only print if count is not zero
              this.push(rawLine + NL);
            }
          }
          // Other lines in final summary (like blank lines) are ignored unless explicitly matched above.
        }
        break;
      }
      case BlockType.FINAL_SUMMARY_REDUNDANT_LIST:
      case BlockType.FINAL_SUMMARY_REDUNDANT_LIST_ITEM_FILE:
      case BlockType.FINAL_SUMMARY_REDUNDANT_LIST_ITEM_TEST:
        // These are parts of bun test's own final summary of failures/skips.
        // We aim to have already captured and de-duplicated this information
        // when processing the original FILE_TEST_RESULTS blocks. So, ignore these.
        break;
      case BlockType.UNKNOWN:
        // If an UNKNOWN block (e.g., an empty line) is immediately followed by an UNHANDLED_ERROR,
        // If an UNKNOWN block (e.g., an empty line) is immediately followed by an UNHANDLED_ERROR,
        // print its content. If the line is visually empty (after ANSI stripping and trimming),
        // print just a newline. Otherwise, print the original raw line.
        if (nextBlockType === BlockType.UNHANDLED_ERROR) {
          this.currentBlockLines.forEach(rawLine => {
            const visuallyEmpty = stripAnsi(rawLine).trim() === '';
            if (visuallyEmpty) {
              this.push(NL); // Push a clean newline for visually empty lines
            } else {
              // Reverting to push rawLine directly as per feedback.
              this.push(rawLine + NL);
            }
          });
        }
        // Otherwise, discard UNKNOWN blocks' content.
        break;
      case BlockType.IGNORED_TEST_RESULT:
        // These lines (typically (pass) or (skip) outside of a FILE_TEST_RESULTS block
        // or final redundant summary) are explicitly ignored. Their content is discarded.
        break;
    }
    this.currentBlockLines = [];
    this.currentBlockType = BlockType.UNKNOWN;
    // this.hasPrintedFileHeaderInCurrentBlock is primarily managed within the
    // FILE_TEST_RESULTS case and reset in _transform when a new FILE_TEST_RESULTS block starts.
    // A general reset here ensures it's false before the next block determination if not already handled.
    this.hasPrintedFileHeaderInCurrentBlock = false;
    // currentFilePathForBlock and currentFileRawPathLineForBlock are reset when a new FILE_TEST_RESULTS block starts
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      const linesInChunk = (Buffer.isBuffer(chunk) ? chunk.toString() : chunk).split('\n');
      
      for (let i = 0; i < linesInChunk.length; i++) {
        const currentRawContent = linesInChunk[i] ?? ''; // Ensures it's a string

        if (i === linesInChunk.length - 1 && currentRawContent === '' && !chunk.toString().endsWith('\n')) {
          continue;
        }
        
        // Line for logic (block determination): cleaned, trimmed, and BOM-stripped from itself.
        let lineForLogic = stripAnsi(currentRawContent).trim();
        if (lineForLogic.startsWith('\ufeff')) {
          lineForLogic = lineForLogic.substring(1);
        }
        const detectedBlockType = this.determineBlockType(lineForLogic);

        // Line for storage (to be pushed later): only BOM-stripped from original, otherwise raw.
        const storableRawLine: string = currentRawContent.startsWith('\ufeff') ? currentRawContent.substring(1) : currentRawContent;

        let shouldProcessAndStartNewBlock = false;

        if (detectedBlockType !== BlockType.UNKNOWN && detectedBlockType !== this.currentBlockType) {
          shouldProcessAndStartNewBlock = true;
        } else if (detectedBlockType === BlockType.FILE_TEST_RESULTS) {
          const match = lineForLogic.match(filePathRegex); // Changed line to lineForLogic
          if (match && match[1]) {
            const detectedFilePath = match[1];
            if (this.currentBlockType !== BlockType.FILE_TEST_RESULTS || detectedFilePath !== this.currentFilePathForBlock) {
              shouldProcessAndStartNewBlock = true;
            }
          }
        } else if (detectedBlockType === BlockType.UNKNOWN &&
                   this.currentBlockType !== BlockType.UNKNOWN &&
                   this.currentBlockType !== BlockType.FILE_TEST_RESULTS &&
                   this.currentBlockType !== BlockType.UNHANDLED_ERROR // UNHANDLED_ERROR blocks manage their own UNKNOWN lines
                   ) {
            // If current block was a "known" type (e.g. COVERAGE_SUMMARY, but NOT FILE_TEST_RESULTS or UNHANDLED_ERROR)
            // and the new line is UNKNOWN. This means the known block has ended.
            shouldProcessAndStartNewBlock = true;
        }

        if (shouldProcessAndStartNewBlock) {
          this.processCurrentBlockAndClear(detectedBlockType); // Pass the next block type
          this.currentBlockType = detectedBlockType;

          // Manage isInFinalSummarySection state based on the NEW block type
          if (this.currentBlockType === BlockType.FINAL_SUMMARY ||
              this.currentBlockType === BlockType.FINAL_SUMMARY_REDUNDANT_LIST) {
            this.isInFinalSummarySection = true;
          } else if (this.currentBlockType === BlockType.FILE_TEST_RESULTS ||
                     this.currentBlockType === BlockType.UNHANDLED_ERROR ||
                     this.currentBlockType === BlockType.COVERAGE_SUMMARY) {
            // These types signify we are definitely NOT in the final summary list section
            this.isInFinalSummarySection = false;
          }
          // For _ITEM_FILE, _ITEM_TEST, or UNKNOWN, isInFinalSummarySection persists its previous state,
          // as these lines are contextually part of whatever section (final summary or not) they fall into.

          if (this.currentBlockType === BlockType.FILE_TEST_RESULTS) {
            // For FILE_TEST_RESULTS, the storableRawLine is the file path header.
            // It's stored in currentFileRawPathLineForBlock.
            // currentBlockLines should be for the content *under* this header.
            this.currentBlockLines = []; // Initialize for content lines
            const match = lineForLogic.match(filePathRegex); // Use lineForLogic for matching
            if (match && match[1]) {
              this.currentFilePathForBlock = match[1];
              this.currentFileRawPathLineForBlock = storableRawLine; // Store BOM-free raw line
              this.hasPrintedFileHeaderInCurrentBlock = false;
            }
            // Do not add the header line itself to currentBlockLines here; it's handled by currentFileRawPathLineForBlock
          } else {
            // For other new block types, the storableRawLine is the first line of that block's content.
            this.currentBlockLines = [storableRawLine];
          }
          
          // Clear path info if the new block is not a file results block or part of a redundant list
          // This should be outside the FILE_TEST_RESULTS specific logic for setting currentBlockLines
          if (this.currentBlockType !== BlockType.FILE_TEST_RESULTS &&
              this.currentBlockType !== BlockType.FINAL_SUMMARY_REDUNDANT_LIST_ITEM_FILE &&
              this.currentBlockType !== BlockType.FINAL_SUMMARY_REDUNDANT_LIST_ITEM_TEST) {
            // Clear path info if not a file results block or part of a redundant list that might use it
            // this.currentFilePathForBlock = null; // Avoid clearing if it's a list item that might refer to a path
            // this.currentFileRawPathLineForBlock = null;
          }
        } else {
          this.currentBlockLines.push(storableRawLine); // Add BOM-free raw line
        }
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    this.processCurrentBlockAndClear();
    this.isInFinalSummarySection = false; 
    callback();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const bunArgs = args.filter(arg => arg !== '--watch');

  try {
    const proc = $`bun test --colors ${bunArgs}`.nothrow();
    const parserTransform = new BunTestOutputParser();
    
    proc.stdout.pipe(parserTransform).pipe(process.stdout);
    proc.stderr.pipe(parserTransform).pipe(process.stdout); 

    await proc;

  } catch (error: any) {
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
