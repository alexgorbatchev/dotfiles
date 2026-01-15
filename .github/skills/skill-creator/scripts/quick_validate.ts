#!/usr/bin/env bun
/**
 * Quick validation script for skills - minimal version
 */

import { parse as parseYaml } from 'yaml';

const ALLOWED_PROPERTIES = new Set([
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata',
]);

interface ValidationResult {
  valid: boolean;
  message: string;
}

export async function validateSkill(skillPath: string): Promise<ValidationResult> {
  const skillMdPath = `${skillPath}/SKILL.md`;
  const file = Bun.file(skillMdPath);

  // Check SKILL.md exists
  if (!file.size) {
    return { valid: false, message: 'SKILL.md not found' };
  }

  const content = await file.text();

  if (!content.startsWith('---')) {
    return { valid: false, message: 'No YAML frontmatter found' };
  }

  // Extract frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match || !match[1]) {
    return { valid: false, message: 'Invalid frontmatter format' };
  }

  const frontmatterText = match[1];

  // Parse YAML frontmatter
  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseYaml(frontmatterText);
    if (typeof frontmatter !== 'object' || frontmatter === null) {
      return { valid: false, message: 'Frontmatter must be a YAML dictionary' };
    }
  } catch (e) {
    return {
      valid: false,
      message: `Invalid YAML in frontmatter: ${e instanceof Error ? e.message : e}`,
    };
  }

  // Check for unexpected properties
  const unexpectedKeys = Object.keys(frontmatter).filter(
    (key) => !ALLOWED_PROPERTIES.has(key),
  );
  if (unexpectedKeys.length > 0) {
    return {
      valid: false,
      message: `Unexpected key(s) in SKILL.md frontmatter: ${
        unexpectedKeys.toSorted().join(', ')
      }. Allowed properties are: ${[...ALLOWED_PROPERTIES].toSorted().join(', ')}`,
    };
  }

  // Check required fields
  if (!('name' in frontmatter)) {
    return { valid: false, message: "Missing 'name' in frontmatter" };
  }
  if (!('description' in frontmatter)) {
    return { valid: false, message: "Missing 'description' in frontmatter" };
  }

  // Validate name
  const name = frontmatter.name;
  if (typeof name !== 'string') {
    return {
      valid: false,
      message: `Name must be a string, got ${typeof name}`,
    };
  }

  const trimmedName = name.trim();
  if (trimmedName) {
    // Check naming convention (hyphen-case: lowercase with hyphens)
    if (!/^[a-z0-9-]+$/.test(trimmedName)) {
      return {
        valid: false,
        message: `Name '${trimmedName}' should be hyphen-case (lowercase letters, digits, and hyphens only)`,
      };
    }
    if (
      trimmedName.startsWith('-') ||
      trimmedName.endsWith('-') ||
      trimmedName.includes('--')
    ) {
      return {
        valid: false,
        message: `Name '${trimmedName}' cannot start/end with hyphen or contain consecutive hyphens`,
      };
    }
    // Check name length (max 64 characters per spec)
    if (trimmedName.length > 64) {
      return {
        valid: false,
        message: `Name is too long (${trimmedName.length} characters). Maximum is 64 characters.`,
      };
    }
  }

  // Validate description
  const description = frontmatter.description;
  if (typeof description !== 'string') {
    return {
      valid: false,
      message: `Description must be a string, got ${typeof description}`,
    };
  }

  const trimmedDescription = description.trim();
  if (trimmedDescription) {
    // Check for angle brackets
    if (trimmedDescription.includes('<') || trimmedDescription.includes('>')) {
      return {
        valid: false,
        message: 'Description cannot contain angle brackets (< or >)',
      };
    }
    // Check description length (max 1024 characters per spec)
    if (trimmedDescription.length > 1024) {
      return {
        valid: false,
        message: `Description is too long (${trimmedDescription.length} characters). Maximum is 1024 characters.`,
      };
    }
  }

  return { valid: true, message: 'Skill is valid!' };
}

// CLI entry point
if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const skillDir = args[0];

  if (args.length !== 1 || !skillDir) {
    console.log('Usage: bun quick_validate.ts <skill_directory>');
    process.exit(1);
  }

  const result = await validateSkill(skillDir);
  console.log(result.message);
  process.exit(result.valid ? 0 : 1);
}
