import type { AnalysisResults } from './types';

export function formatResults(results: AnalysisResults): string {
  const lines: string[] = [];

  if (results.unusedExports.length > 0) {
    lines.push('🔍 Unused Exports:');
    lines.push('');

    const exportsByFile = groupByFile(results.unusedExports);
    for (const [filePath, items] of exportsByFile.entries()) {
      lines.push(filePath);
      for (const item of items) {
        lines.push(`  ${item.exportName}:${item.line} (Unused ${item.kind})`);
      }
      lines.push('');
    }
  }

  if (results.unusedProperties.length > 0) {
    lines.push('🔍 Unused Type/Interface Properties:');
    lines.push('');

    const propertiesByFile = groupByFile(results.unusedProperties);
    for (const [filePath, items] of propertiesByFile.entries()) {
      lines.push(filePath);
      for (const item of items) {
        lines.push(`  ${item.typeName}.${item.propertyName}:${item.line} (Unused property)`);
      }
      lines.push('');
    }
  }

  if (results.unusedExports.length === 0 && results.unusedProperties.length === 0) {
    lines.push('✅ No unused exports or properties found!');
  } else {
    lines.push('📊 Summary:');
    lines.push(`  Unused exports: ${results.unusedExports.length}`);
    lines.push(`  Unused properties: ${results.unusedProperties.length}`);
  }

  return lines.join('\n');
}

function groupByFile<T extends { filePath: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const existing = grouped.get(item.filePath);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(item.filePath, [item]);
    }
  }

  return grouped;
}
