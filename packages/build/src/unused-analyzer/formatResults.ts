import type { AnalysisResults, Severity, UnusedExportResult, UnusedPropertyResult } from './types';

function getSeverityMarker(severity: Severity): string {
  const markers: Record<Severity, string> = {
    error: '[ERROR]',
    warning: '[WARNING]',
    info: '[INFO]',
  };
  return markers[severity];
}

function formatExportLine(item: UnusedExportResult): string {
  const marker: string = getSeverityMarker(item.severity);
  if (item.onlyUsedInTests) {
    return `  ${item.exportName}:${item.line}:${item.character}-${item.endCharacter} ${marker} (Used only in tests)`;
  }
  return `  ${item.exportName}:${item.line}:${item.character}-${item.endCharacter} ${marker} (Unused ${item.kind})`;
}

function formatPropertyLine(item: UnusedPropertyResult): string {
  const status: string = item.onlyUsedInTests ? 'Used only in tests' : 'Unused property';
  const todoSuffix: string = item.todoComment ? `: [TODO] ${item.todoComment}` : '';
  const marker: string = getSeverityMarker(item.severity);
  return `  ${item.typeName}.${item.propertyName}:${item.line}:${item.character}-${item.endCharacter} ${marker} (${status}${todoSuffix})`;
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

  // Create a set of unused export names (interfaces/types) for quick lookup
  const unusedExportNames = new Set<string>();
  for (const exportItem of results.unusedExports) {
    unusedExportNames.add(exportItem.exportName);
  }

  // Filter out properties whose parent type/interface is already reported as unused
  const propertiesToReport: UnusedPropertyResult[] = results.unusedProperties.filter(
    (prop) => !unusedExportNames.has(prop.typeName)
  );

  if (results.unusedExports.length > 0) {
    lines.push('🔍 Unused Exports:');
    lines.push('');
    lines.push(...formatGroupedItems(results.unusedExports, formatExportLine));
  }

  if (propertiesToReport.length > 0) {
    lines.push('🔍 Unused Type/Interface Properties:');
    lines.push('');
    lines.push(...formatGroupedItems(propertiesToReport, formatPropertyLine));
  }

  if (results.unusedExports.length === 0 && propertiesToReport.length === 0) {
    lines.push('✅ No unused exports or properties found!');
  } else {
    lines.push('📊 Summary:');
    lines.push(`  Unused exports: ${results.unusedExports.length}`);
    lines.push(`  Unused properties: ${propertiesToReport.length}`);
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
