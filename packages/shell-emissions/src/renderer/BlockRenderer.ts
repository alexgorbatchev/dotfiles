import { isScriptEmission } from "../emissions/guards";
import type {
  IBlock,
  IBlockRenderer,
  IEmissionFormatter,
  IOnceScript,
  IRenderedOutput,
  IScriptEmission,
} from "../types";
import { ONCE_SCRIPT_STARTING_INDEX, SectionPriority } from "./constants";

interface IOnceScriptEmissionRef {
  emission: IScriptEmission;
  blockPriority: number;
}

/**
 * Renders blocks using the provided formatter.
 */
export class BlockRenderer implements IBlockRenderer {
  /**
   * Renders blocks to shell content.
   */
  render(blocks: IBlock[], formatter: IEmissionFormatter): IRenderedOutput {
    const sortedBlocks = blocks.toSorted((a, b) => a.priority - b.priority);
    const lines: string[] = [];
    const onceScripts: IOnceScript[] = [];
    let onceScriptIndex = ONCE_SCRIPT_STARTING_INDEX;

    // Track once scripts to determine where to insert initializer
    const onceScriptEmissions: IOnceScriptEmissionRef[] = [];

    // First pass: collect once scripts
    for (const block of sortedBlocks) {
      this.collectOnceScripts(block, onceScriptEmissions);
    }

    // Find where to insert once script initializer (after last block with priority below threshold)
    let initializerInsertIndex = -1;
    if (onceScriptEmissions.length > 0) {
      for (let i = sortedBlocks.length - 1; i >= 0; i--) {
        const currentBlock = sortedBlocks[i];
        if (currentBlock && currentBlock.priority < SectionPriority.OnceScripts) {
          initializerInsertIndex = i;
          break;
        }
      }
    }

    // Second pass: render blocks
    for (const [i, block] of sortedBlocks.entries()) {
      const blockLines = this.renderBlock(block, formatter, onceScripts, onceScriptIndex);

      if (blockLines.length > 0) {
        if (lines.length > 0) {
          lines.push("");
        }
        lines.push(...blockLines);
      }

      // Update once script index
      onceScriptIndex = onceScripts.length + 1;

      // Insert once script initializer after appropriate block
      if (i === initializerInsertIndex && onceScriptEmissions.length > 0) {
        lines.push("");
        lines.push(formatter.formatOnceScriptInitializer());
      }
    }

    return {
      content: lines.join("\n"),
      fileExtension: formatter.fileExtension,
      onceScripts,
    };
  }

  private collectOnceScripts(block: IBlock, results: IOnceScriptEmissionRef[]): void {
    for (const emission of block.emissions) {
      if (isScriptEmission(emission) && emission.timing === "once") {
        results.push({ emission, blockPriority: block.priority });
      }
    }
    for (const child of block.children ?? []) {
      this.collectOnceScripts(child, results);
    }
  }

  private renderBlock(
    block: IBlock,
    formatter: IEmissionFormatter,
    onceScripts: IOnceScript[],
    startIndex: number,
  ): string[] {
    const lines: string[] = [];
    let onceScriptIndex = startIndex;

    // Handle file header
    if (block.isFileHeader) {
      lines.push(formatter.formatFileHeader(block.metadata));
      return lines;
    }

    // Handle file footer
    if (block.isFileFooter) {
      lines.push(formatter.formatFileFooter());
      return lines;
    }

    // Check if block has any content
    const hasEmissions = block.emissions.length > 0;
    const hasChildren = (block.children?.length ?? 0) > 0;

    if (!hasEmissions && !hasChildren) {
      return lines;
    }

    // Render section header if block has title
    if (block.title) {
      lines.push(formatter.formatSectionHeader(block.title));
    }

    // Render emissions
    let previousSource: string | undefined;
    for (const emission of block.emissions) {
      // Emit source comment if source changed
      if (emission.source && emission.source !== previousSource) {
        lines.push(formatter.comment(emission.source));
        previousSource = emission.source;
      }

      // Handle once scripts specially
      if (isScriptEmission(emission) && emission.timing === "once") {
        const onceResult = formatter.formatOnceScript(emission, onceScriptIndex);
        onceScripts.push({
          filename: onceResult.filename,
          content: onceResult.content,
          executable: true,
        });
        onceScriptIndex++;
      } else {
        lines.push(formatter.formatEmission(emission));
      }
    }

    // Render children
    for (const child of block.children ?? []) {
      if (child.emissions.length === 0) {
        continue;
      }

      lines.push("");
      lines.push(formatter.formatChildBlockHeader(child));

      let childPreviousSource: string | undefined;
      for (const emission of child.emissions) {
        if (emission.source && emission.source !== childPreviousSource) {
          lines.push(formatter.comment(emission.source));
          childPreviousSource = emission.source;
        }

        if (isScriptEmission(emission) && emission.timing === "once") {
          const onceResult = formatter.formatOnceScript(emission, onceScriptIndex);
          onceScripts.push({
            filename: onceResult.filename,
            content: onceResult.content,
            executable: true,
          });
          onceScriptIndex++;
        } else {
          lines.push(formatter.formatEmission(emission));
        }
      }
    }

    return lines;
  }
}
