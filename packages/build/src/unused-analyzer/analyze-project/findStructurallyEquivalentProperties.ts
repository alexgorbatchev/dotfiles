import type {
  InterfaceDeclaration,
  Node,
  Project,
  PropertyDeclaration,
  PropertySignature,
  TypeAliasDeclaration,
} from 'ts-morph';
import { SyntaxKind } from 'ts-morph';

function checkInterfaceProperties(
  iface: InterfaceDeclaration,
  propName: string,
  propType: string,
  originalProp: PropertySignature | PropertyDeclaration,
  equivalentProps: Array<PropertySignature | PropertyDeclaration>
): void {
  const properties = iface.getProperties();
  for (const p of properties) {
    if (p === originalProp) {
      continue;
    }
    if (p.getName() === propName) {
      const pType: string = p.getType().getText();
      if (pType === propType) {
        equivalentProps.push(p);
      }
    }
  }
}

function checkTypeAliasProperties(
  typeAlias: TypeAliasDeclaration,
  propName: string,
  propType: string,
  originalProp: PropertySignature | PropertyDeclaration,
  equivalentProps: Array<PropertySignature | PropertyDeclaration>
): void {
  const typeNode: Node | undefined = typeAlias.getTypeNode();
  if (!typeNode || typeNode.getKind() !== SyntaxKind.TypeLiteral) {
    return;
  }

  const properties = typeNode.getChildren().filter((child) => child.getKind() === SyntaxKind.PropertySignature);

  for (const p of properties) {
    if (p === originalProp) {
      continue;
    }
    if (p.getKind() === SyntaxKind.PropertySignature && (p as PropertySignature).getName() === propName) {
      const pType: string = (p as PropertySignature).getType().getText();
      if (pType === propType) {
        equivalentProps.push(p as PropertySignature);
      }
    }
  }
}

/**
 * Finds properties that are structurally equivalent to the given property.
 * Two properties are structurally equivalent if they have:
 * - Same property name
 * - Same type signature
 *
 * This handles cases where properties are re-declared across interfaces,
 * such as when one interface extends another and re-declares properties,
 * or when spread operations flow values between structurally similar types.
 */
export function findStructurallyEquivalentProperties(
  prop: PropertySignature | PropertyDeclaration,
  project: Project
): Array<PropertySignature | PropertyDeclaration> {
  const propName: string = prop.getName();
  const propType: string = prop.getType().getText();
  const equivalentProps: Array<PropertySignature | PropertyDeclaration> = [];

  const sourceFiles = project.getSourceFiles();

  for (const sourceFile of sourceFiles) {
    const interfaces: InterfaceDeclaration[] = sourceFile.getInterfaces();
    for (const iface of interfaces) {
      checkInterfaceProperties(iface, propName, propType, prop, equivalentProps);
    }

    const typeAliases: TypeAliasDeclaration[] = sourceFile.getTypeAliases();
    for (const typeAlias of typeAliases) {
      checkTypeAliasProperties(typeAlias, propName, propType, prop, equivalentProps);
    }
  }

  return equivalentProps;
}
