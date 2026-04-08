import type { SectionPriority } from "../renderer/types";
import type { Emission, EmissionKind } from "./emissions";

/**
 * Additional metadata for blocks.
 */
export interface IBlockMetadata {
  /** Rendered as comment */
  description?: string;
  /** Attribution for header */
  sourceFile?: string;
  /** Generation timestamp */
  generatedAt?: Date;
}

export type BlockMetadata = IBlockMetadata;

/**
 * A container for organizing emissions hierarchically.
 * Top-level blocks use SectionPriority values, child blocks use sequential numbers.
 */
export interface IBlock {
  /** Unique identifier */
  id: string;
  /** Human-readable title for header */
  title?: string;
  /** Sort order (lower = earlier). Top-level blocks use SectionPriority, children use sequential numbers. */
  priority: number;
  /** Emissions in this block */
  emissions: Emission[];
  /** Nested blocks */
  children?: IBlock[];
  /** Additional information */
  metadata?: IBlockMetadata;
  /** True if this block should render file header */
  isFileHeader?: boolean;
  /** True if this block should render file footer */
  isFileFooter?: boolean;
}

export type Block = IBlock;

/**
 * Options for defining a section in the block builder.
 */
export interface ISectionOptions {
  /** Section header text (omit for no header) */
  title?: string;
  /** Sort order (lower = earlier in output) */
  priority: SectionPriority;
  /** Which hoisted emission kinds this section accepts */
  hoistKinds?: EmissionKind[];
  /** Whether non-hoisted emissions can create child blocks here */
  allowChildren?: boolean;
  /** True = render formatFileHeader() instead of section */
  isFileHeader?: boolean;
  /** True = render formatFileFooter() instead of section */
  isFileFooter?: boolean;
  /** Additional metadata for this section */
  metadata?: IBlockMetadata;
}

export type SectionOptions = ISectionOptions;
