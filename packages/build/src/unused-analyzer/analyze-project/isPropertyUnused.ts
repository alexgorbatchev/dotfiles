import type { PropertyDeclaration, PropertySignature, ReferencedSymbol, SourceFile } from 'ts-morph';
import type { IsTestFileFn } from '../types';

export function isPropertyUnused(prop: PropertySignature | PropertyDeclaration, isTestFile: IsTestFileFn): boolean {
  const references: ReferencedSymbol[] = prop.findReferences();

  // Count total references across all files
  let totalReferences = 0;
  for (const refGroup of references) {
    const refs = refGroup.getReferences();
    for (const ref of refs) {
      const refSourceFile: SourceFile = ref.getSourceFile();
      if (!isTestFile(refSourceFile)) {
        totalReferences++;
      }
    }
  }

  // A property is unused if it only has 1 reference (the definition itself)
  // If it has more than 1 reference, at least one is an actual usage
  return totalReferences <= 1;
}
