import type { Project, PropertyDeclaration, PropertySignature, ReferencedSymbol, SourceFile } from 'ts-morph';
import type { IsTestFileFn } from '../types';
import { findStructurallyEquivalentProperties } from './findStructurallyEquivalentProperties';

function countPropertyReferences(prop: PropertySignature | PropertyDeclaration, isTestFile: IsTestFileFn): number {
  const references: ReferencedSymbol[] = prop.findReferences();
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
  return totalReferences;
}

export function isPropertyUnused(
  prop: PropertySignature | PropertyDeclaration,
  isTestFile: IsTestFileFn,
  project: Project
): boolean {
  const totalReferences: number = countPropertyReferences(prop, isTestFile);

  // A property is unused if it only has 1 reference (the definition itself)
  if (totalReferences > 1) {
    return false;
  }

  // Check structurally equivalent properties
  const equivalentProps: Array<PropertySignature | PropertyDeclaration> = findStructurallyEquivalentProperties(
    prop,
    project
  );

  for (const equivalentProp of equivalentProps) {
    const equivalentRefs: number = countPropertyReferences(equivalentProp, isTestFile);
    if (equivalentRefs > 1) {
      return false;
    }
  }

  return true;
}
