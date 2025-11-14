import type { AnalysisResults, UnusedExportResult, UnusedPropertyResult } from './types';

function formatExportLine(item: UnusedExportResult): string {
  return `  ${item.exportName}:${item.line} (Unused ${item.kind})`;
}

function formatPropertyLine(item: UnusedPropertyResult): string {
  const todoSuffix: string = item.todoComment ? `: [TODO] ${item.todoComment}` : '';
  return `  ${item.typeName}.${item.propertyName}:${item.line} (Unused property${todoSuffix})`;
}

function formatGroupedItems<T extends { filePath: string }>(items: T[], formatter: (item: T) => string): string[] {
  const lines: string[] = [];
  const grouped = groupByFile(items);

  for (const [filePath, groupItems] of grouped.entries()) {
    lines.push(filePath);
    for (const item of groupItems) {
      lines.push(formatter(item));
    }
    lines.push('');
  }

  return lines;
}

export function formatResults(results: AnalysisResults): string {
  const lines: string[] = [];

  if (results.unusedExports.length > 0) {
    lines.push('🔍 Unused Exports:');
    lines.push('');
    lines.push(...formatGroupedItems(results.unusedExports, formatExportLine));
  }

  if (results.unusedProperties.length > 0) {
    lines.push('🔍 Unused Type/Interface Properties:');
    lines.push('');
    lines.push(...formatGroupedItems(results.unusedProperties, formatPropertyLine));
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
