import path from 'node:path';
import ts from 'typescript';

const LINE_BREAK = '\n';

/**
 * Extracts and formats the complete type signature of a TypeScript type alias.
 *
 * This function uses the TypeScript Compiler API to:
 * 1. Load and parse a TypeScript configuration file
 * 2. Create a TypeScript program with the specified source files
 * 3. Locate the specified type alias declaration
 * 4. Resolve the type to its fully expanded form
 * 5. Print the type signature as formatted TypeScript code
 *
 * The function performs comprehensive validation including:
 * - TypeScript diagnostics checks
 * - Source file existence verification
 * - Type alias presence validation
 * - Type resolution to ensure it's not 'any'
 *
 * @param tsconfigPath - Path to the TypeScript configuration file (tsconfig.json).
 * @param sourceFilePath - Path to the TypeScript source file containing the type alias.
 * @param aliasName - Name of the type alias to extract.
 * @returns The fully formatted type alias signature as a string.
 * @throws {Error} If tsconfig cannot be read or parsed.
 * @throws {Error} If there are TypeScript compilation diagnostics.
 * @throws {Error} If the source file is not found in the program.
 * @throws {Error} If the type alias is not found in the source file.
 * @throws {Error} If the type alias cannot be resolved or resolves to 'any'.
 */
export function extractTypeAliasSignature(tsconfigPath: string, sourceFilePath: string, aliasName: string): string {
  const absoluteTsconfigPath = path.resolve(tsconfigPath);
  const absoluteSourceFilePath = path.resolve(sourceFilePath);

  const configFileResult = ts.readConfigFile(absoluteTsconfigPath, ts.sys.readFile);
  if (configFileResult.error) {
    const message: string = ts.flattenDiagnosticMessageText(configFileResult.error.messageText, LINE_BREAK);
    throw new Error(`Failed to read tsconfig: ${message}`);
  }

  const parsedConfig: ts.ParsedCommandLine = ts.parseJsonConfigFileContent(
    configFileResult.config,
    ts.sys,
    path.dirname(absoluteTsconfigPath),
  );

  const program: ts.Program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
  const diagnostics: readonly ts.Diagnostic[] = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    const diagnosticMessages: string = diagnostics
      .map((diagnostic) => {
        const message: string = ts.flattenDiagnosticMessageText(diagnostic.messageText, LINE_BREAK);
        if (diagnostic.file) {
          const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
          const line: number = position.line + 1;
          const character: number = position.character + 1;
          return `${diagnostic.file.fileName} (${line},${character}): ${message}`;
        }
        return message;
      })
      .join(LINE_BREAK);
    throw new Error(`TypeScript diagnostics while analyzing '${aliasName}':${LINE_BREAK}${diagnosticMessages}`);
  }

  const sourceFile: ts.SourceFile | undefined = program
    .getSourceFiles()
    .find((file) => path.resolve(file.fileName) === absoluteSourceFilePath);

  if (!sourceFile) {
    throw new Error(`Source file not found in program: ${absoluteSourceFilePath}`);
  }

  const typeChecker: ts.TypeChecker = program.getTypeChecker();
  let matchedDeclaration: ts.TypeAliasDeclaration | undefined;

  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === aliasName) {
      matchedDeclaration = statement;
      break;
    }
  }

  if (!matchedDeclaration) {
    throw new Error(`Type alias '${aliasName}' not found in ${absoluteSourceFilePath}`);
  }

  const aliasDeclaration: ts.TypeAliasDeclaration = matchedDeclaration;
  const aliasSymbol: ts.Symbol | undefined = typeChecker.getSymbolAtLocation(aliasDeclaration.name);

  if (!aliasSymbol) {
    throw new Error(`Unable to resolve symbol for type alias '${aliasName}'.`);
  }

  if (!aliasDeclaration.type) {
    throw new Error(`Type alias '${aliasName}' does not have a type declaration.`);
  }

  const resolvedType: ts.Type = typeChecker.getTypeFromTypeNode(aliasDeclaration.type);

  if ((resolvedType.flags & ts.TypeFlags.Any) !== 0) {
    throw new Error(`Type alias '${aliasName}' resolved to 'any'.`);
  }

  const nodeBuilderFlags: ts.NodeBuilderFlags = ts.NodeBuilderFlags.NoTruncation |
    ts.NodeBuilderFlags.MultilineObjectLiterals |
    ts.NodeBuilderFlags.WriteTypeArgumentsOfSignature |
    ts.NodeBuilderFlags.InTypeAlias |
    ts.NodeBuilderFlags.UseStructuralFallback;

  const printableTypeNode: ts.TypeNode | undefined = typeChecker.typeToTypeNode(
    resolvedType,
    aliasDeclaration,
    nodeBuilderFlags,
  );

  if (!printableTypeNode) {
    throw new Error(`Unable to build type node for type alias '${aliasName}'.`);
  }

  if (printableTypeNode.kind === ts.SyntaxKind.AnyKeyword) {
    throw new Error(`Type alias '${aliasName}' resolved to 'any'.`);
  }

  const aliasIdentifier: ts.Identifier = ts.factory.createIdentifier(aliasName);
  const aliasStatement: ts.TypeAliasDeclaration = ts.factory.createTypeAliasDeclaration(
    undefined,
    aliasIdentifier,
    aliasDeclaration.typeParameters,
    printableTypeNode,
  );

  const printer: ts.Printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const aliasSourceFile: ts.SourceFile = ts.factory.createSourceFile(
    [aliasStatement],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  const printedSignature: string = printer.printNode(ts.EmitHint.Unspecified, aliasStatement, aliasSourceFile);
  return printedSignature;
}
