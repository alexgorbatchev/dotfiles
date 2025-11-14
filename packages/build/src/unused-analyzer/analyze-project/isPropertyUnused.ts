import type { Project, PropertyDeclaration, PropertySignature, ReferencedSymbol, SourceFile } from 'ts-morph';
import type { IsTestFileFn } from '../types';
import { findStructurallyEquivalentProperties } from './findStructurallyEquivalentProperties';

interface PropertyReferenceCount {
  totalReferences: number;
  testReferences: number;
  nonTestReferences: number;
}

function countPropertyReferences(
  prop: PropertySignature | PropertyDeclaration,
  isTestFile: IsTestFileFn
): PropertyReferenceCount {
  const references: ReferencedSymbol[] = prop.findReferences();
  let totalReferences = 0;
  let testReferences = 0;
  let nonTestReferences = 0;

  for (const refGroup of references) {
    const refs = refGroup.getReferences();
    for (const ref of refs) {
      const refSourceFile: SourceFile = ref.getSourceFile();
      totalReferences++;

      if (isTestFile(refSourceFile)) {
        testReferences++;
      } else {
        nonTestReferences++;
      }
    }
  }

  const result: PropertyReferenceCount = {
    totalReferences,
    testReferences,
    nonTestReferences,
  };
  return result;
}

export interface PropertyUsageResult {
  isUnusedOrTestOnly: boolean;
  onlyUsedInTests: boolean;
}

export function isPropertyUnused(
  prop: PropertySignature | PropertyDeclaration,
  isTestFile: IsTestFileFn,
  project: Project
): PropertyUsageResult {
  const counts: PropertyReferenceCount = countPropertyReferences(prop, isTestFile);

  // A property is unused if it only has 1 reference (the definition itself)
  // A property is test-only if it has references only from tests
  const onlyUsedInTests: boolean = counts.nonTestReferences === 1 && counts.testReferences > 0;

  if (counts.totalReferences > 1 && !onlyUsedInTests) {
    const result: PropertyUsageResult = { isUnusedOrTestOnly: false, onlyUsedInTests: false };
    return result; // Used in production code
  }

  // Check structurally equivalent properties
  const equivalentProps: Array<PropertySignature | PropertyDeclaration> = findStructurallyEquivalentProperties(
    prop,
    project
  );

  for (const equivalentProp of equivalentProps) {
    const equivalentCounts: PropertyReferenceCount = countPropertyReferences(equivalentProp, isTestFile);
    const equivalentOnlyUsedInTests: boolean =
      equivalentCounts.nonTestReferences === 1 && equivalentCounts.testReferences > 0;

    if (equivalentCounts.totalReferences > 1 && !equivalentOnlyUsedInTests) {
      const result: PropertyUsageResult = { isUnusedOrTestOnly: false, onlyUsedInTests: false };
      return result;
    }
  }

  const result: PropertyUsageResult = { isUnusedOrTestOnly: true, onlyUsedInTests };
  return result;
}
