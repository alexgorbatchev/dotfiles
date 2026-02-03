import { isHoisted } from '../emissions/guards';
import { BlockValidationError } from '../errors';
import type { Block, Emission, EmissionKind, SectionOptions } from '../types';

interface SectionDefinition {
  id: string;
  options: SectionOptions;
  emissions: Emission[];
  children: Map<string, ChildBlockDefinition>;
  childInsertionOrder: string[];
}

interface ChildBlockDefinition {
  id: string;
  emissions: Emission[];
  sourceFile?: string;
}

/**
 * Fluent builder for constructing block structures.
 */
export class BlockBuilder {
  private sections: Map<string, SectionDefinition> = new Map();
  private sectionOrder: string[] = [];

  /**
   * Defines a section in the block structure.
   * Call in priority order for deterministic output.
   */
  addSection(id: string, options: SectionOptions): BlockBuilder {
    if (this.sections.has(id)) {
      throw new BlockValidationError(id, 'section already exists');
    }
    if (options.priority < 0) {
      throw new BlockValidationError(id, 'priority must be non-negative');
    }

    this.sections.set(id, {
      id,
      options,
      emissions: [],
      children: new Map(),
      childInsertionOrder: [],
    });
    this.sectionOrder.push(id);
    return this;
  }

  /**
   * Adds an emission to the block structure.
   * Routing is automatic based on hoisting rules.
   * @param emission - The emission to add
   * @param childBlockId - For non-hoisted emissions, identifies which child block to use
   */
  addEmission(emission: Emission, childBlockId?: string): BlockBuilder {
    if (isHoisted(emission)) {
      this.addHoistedEmission(emission);
    } else {
      this.addNonHoistedEmission(emission, childBlockId);
    }
    return this;
  }

  /**
   * Builds the final block structure.
   * Returns top-level blocks only; children are nested within.
   */
  build(): Block[] {
    const blocks: Block[] = [];

    for (const sectionId of this.sectionOrder) {
      const section = this.sections.get(sectionId);
      if (!section) {
        continue;
      }

      const block = this.buildBlock(section);
      blocks.push(block);
    }

    return blocks.toSorted((a, b) => a.priority - b.priority);
  }

  private addHoistedEmission(emission: Emission): void {
    const targetSection = this.findHoistTarget(emission.kind);
    if (!targetSection) {
      throw new BlockValidationError(
        'unknown',
        `no section accepts hoisted emission kind "${emission.kind}"`,
      );
    }
    targetSection.emissions.push(emission);
  }

  private addNonHoistedEmission(emission: Emission, childBlockId?: string): void {
    const targetSection = this.findChildrenSection();
    if (!targetSection) {
      throw new BlockValidationError(
        'unknown',
        'no section allows children for non-hoisted emissions',
      );
    }

    if (childBlockId) {
      let childBlock = targetSection.children.get(childBlockId);
      if (!childBlock) {
        childBlock = {
          id: childBlockId,
          emissions: [],
          sourceFile: emission.source,
        };
        targetSection.children.set(childBlockId, childBlock);
        targetSection.childInsertionOrder.push(childBlockId);
      }
      childBlock.emissions.push(emission);
    } else {
      targetSection.emissions.push(emission);
    }
  }

  private findHoistTarget(kind: EmissionKind): SectionDefinition | undefined {
    for (const section of this.sections.values()) {
      if (section.options.hoistKinds?.includes(kind)) {
        return section;
      }
    }
    return undefined;
  }

  private findChildrenSection(): SectionDefinition | undefined {
    for (const section of this.sections.values()) {
      if (section.options.allowChildren) {
        return section;
      }
    }
    return undefined;
  }

  private buildBlock(section: SectionDefinition): Block {
    const sortedEmissions = section.emissions.toSorted(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
    );

    const children: Block[] = [];
    for (const childId of section.childInsertionOrder) {
      const childDef = section.children.get(childId);
      if (!childDef) {
        continue;
      }

      const childEmissions = childDef.emissions.toSorted(
        (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
      );

      children.push({
        id: childDef.id,
        title: childDef.id,
        priority: children.length,
        emissions: childEmissions,
        metadata: childDef.sourceFile ? { sourceFile: childDef.sourceFile } : undefined,
      });
    }

    return {
      id: section.id,
      title: section.options.title,
      priority: section.options.priority,
      emissions: sortedEmissions,
      children: children.length > 0 ? children : undefined,
      metadata: section.options.metadata,
      isFileHeader: section.options.isFileHeader,
      isFileFooter: section.options.isFileFooter,
    };
  }
}
