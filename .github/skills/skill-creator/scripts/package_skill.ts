#!/usr/bin/env bun
/**
 * Skill Packager - Creates a distributable .skill file of a skill folder
 *
 * Usage:
 *     bun package_skill.ts <path/to/skill-folder> [output-directory]
 *
 * Example:
 *     bun package_skill.ts skills/public/my-skill
 *     bun package_skill.ts skills/public/my-skill ./dist
 */

import { basename, join, relative, resolve } from 'path';
import { validateSkill } from './quick_validate';

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await Array.fromAsync(
    new Bun.Glob('**/*').scan({ cwd: dir, dot: true }),
  );

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = await Bun.file(fullPath).exists();
    if (stat) {
      files.push(fullPath);
    }
  }

  return files;
}

async function packageSkill(
  skillPath: string,
  outputDir?: string,
): Promise<string | null> {
  const resolvedPath = resolve(skillPath);

  // Validate skill folder exists
  try {
    const stat = await Bun.file(join(resolvedPath, 'SKILL.md')).exists();
    if (!stat) {
      throw new Error('Not a directory or SKILL.md missing');
    }
  } catch {
    console.log(`❌ Error: Skill folder not found or invalid: ${resolvedPath}`);
    return null;
  }

  // Validate SKILL.md exists
  const skillMdPath = join(resolvedPath, 'SKILL.md');
  if (!(await Bun.file(skillMdPath).exists())) {
    console.log(`❌ Error: SKILL.md not found in ${resolvedPath}`);
    return null;
  }

  // Run validation before packaging
  console.log('🔍 Validating skill...');
  const { valid, message } = await validateSkill(resolvedPath);
  if (!valid) {
    console.log(`❌ Validation failed: ${message}`);
    console.log('   Please fix the validation errors before packaging.');
    return null;
  }
  console.log(`✅ ${message}\n`);

  // Determine output location
  const skillName = basename(resolvedPath);
  const outputPath = outputDir ? resolve(outputDir) : process.cwd();

  // Create output directory if needed
  await Bun.write(join(outputPath, '.keep'), '');
  await Bun.file(join(outputPath, '.keep')).exists();

  const skillFilename = join(outputPath, `${skillName}.skill`);

  // Create the .skill file (zip format)
  try {
    const files = await getAllFiles(resolvedPath);
    const parentDir = resolve(resolvedPath, '..');

    // Use Bun's native zip support
    const zipEntries: { path: string; data: Uint8Array; }[] = [];

    for (const filePath of files) {
      const arcname = relative(parentDir, filePath);
      const data = await Bun.file(filePath).arrayBuffer();
      zipEntries.push({ path: arcname, data: new Uint8Array(data) });
      console.log(`  Added: ${arcname}`);
    }

    // Write zip file using Bun's writer
    const proc = Bun.spawn(
      ['zip', '-r', skillFilename, skillName],
      {
        cwd: parentDir,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    await proc.exited;

    if (proc.exitCode !== 0) {
      throw new Error('Failed to create zip file');
    }

    console.log(`\n✅ Successfully packaged skill to: ${skillFilename}`);
    return skillFilename;
  } catch (e) {
    console.log(
      `❌ Error creating .skill file: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}

// CLI entry point
if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const skillPath = args[0];
  const outputDir = args[1];

  if (args.length < 1 || !skillPath) {
    console.log(
      'Usage: bun package_skill.ts <path/to/skill-folder> [output-directory]',
    );
    console.log('\nExample:');
    console.log('  bun package_skill.ts skills/public/my-skill');
    console.log('  bun package_skill.ts skills/public/my-skill ./dist');
    process.exit(1);
  }

  console.log(`📦 Packaging skill: ${skillPath}`);
  if (outputDir) {
    console.log(`   Output directory: ${outputDir}`);
  }
  console.log();

  const result = await packageSkill(skillPath, outputDir);
  process.exit(result ? 0 : 1);
}
