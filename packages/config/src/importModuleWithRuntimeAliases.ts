import { NodeFileSystem } from "@dotfiles/file-system";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_ALIAS_MODULE_SOURCE = [
  "const Platform = Object.freeze({ None: 0, Linux: 1, MacOS: 2, Windows: 4, Unix: 3, All: 7 });",
  "const Architecture = Object.freeze({ None: 0, X86_64: 1, Arm64: 2, All: 3 });",
  "",
  "function defineConfig(config) {",
  "  return config;",
  "}",
  "",
  "function defineTool(fn) {",
  "  return async (install, ctx) => {",
  "    const result = fn(install, ctx);",
  "    return result instanceof Promise ? await result : result;",
  "  };",
  "}",
  "",
  "function dedentString(str) {",
  '  const lines = str.split("\\n");',
  "  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);",
  "",
  "  if (nonEmptyLines.length === 0) {",
  "    return str;",
  "  }",
  "",
  "  const minIndent = Math.min(...nonEmptyLines.map((line) => line.match(/^ */)?.[0].length ?? 0));",
  '  return lines.map((line) => line.slice(minIndent)).join("\\n").trim();',
  "}",
  "",
  "function processStandalonePlaceholder(line, standalonePlaceholderMatch, values) {",
  "  const key = standalonePlaceholderMatch[1];",
  "",
  "  if (key && key in values) {",
  "    const value = values[key];",
  "    if (value !== undefined) {",
  '      const lineIndent = line.match(/^(\\s*)/)?.[1] ?? "";',
  '      const valueLines = value.split("\\n");',
  "      return valueLines.map((valueLine) => lineIndent + valueLine);",
  "    }",
  "  }",
  "",
  "  return [line];",
  "}",
  "",
  "function processInlinePlaceholders(line, values) {",
  "  let processedLine = line;",
  "  const placeholderRegex = /{(\\w+)}/g;",
  "  let match = placeholderRegex.exec(processedLine);",
  "",
  "  while (match !== null) {",
  "    const fullMatch = match[0];",
  "    const key = match[1];",
  "",
  "    if (key && key in values) {",
  "      const value = values[key];",
  "      if (value !== undefined) {",
  "        processedLine = processedLine.replace(fullMatch, value);",
  "        placeholderRegex.lastIndex = 0;",
  "      }",
  "    }",
  "",
  "    match = placeholderRegex.exec(processedLine);",
  "  }",
  "",
  "  return processedLine;",
  "}",
  "",
  "function dedentTemplate(template, values) {",
  "  const dedentedText = dedentString(template);",
  '  const dedentedLines = dedentedText.split("\\n");',
  "  const resultLines = [];",
  "",
  "  for (const line of dedentedLines) {",
  "    const trimmedLine = line.trim();",
  "    const standalonePlaceholderMatch = trimmedLine.match(/^{(\\w+)}$/);",
  "",
  "    if (standalonePlaceholderMatch) {",
  "      resultLines.push(...processStandalonePlaceholder(line, standalonePlaceholderMatch, values));",
  "      continue;",
  "    }",
  "",
  "    resultLines.push(processInlinePlaceholders(line, values));",
  "  }",
  "",
  '  return resultLines.join("\\n");',
  "}",
  "",
  "export { Architecture, Platform, dedentString, dedentTemplate, defineConfig, defineTool };",
].join("\n");

const EXTENSION_RESOLUTION_ORDER = [".tsx", ".jsx", ".ts", ".mts", ".cts", ".mjs", ".js", ".cjs", ".json"];
const RUNTIME_ALIAS_SPECIFIERS = ["@dotfiles/cli", "@alexgorbatchev/dotfiles"] as const;
const nodeFileSystem = new NodeFileSystem();

type TranspilerLoader = "js" | "jsx" | "ts" | "tsx";

interface IModuleImport {
  resolvedModulePath?: string;
  specifier: string;
}

interface IModuleGraphNode {
  imports: IModuleImport[];
  mirroredModulePath: string;
  originalModulePath: string;
  source: string;
}

interface IModuleGraphScanResult {
  hasRuntimeAliasSpecifier: boolean;
  modules: Map<string, IModuleGraphNode>;
}

interface IRewrittenModuleGraph {
  entryModulePath: string;
  rootDir: string;
}

function createMirrorRootPath(modulePath: string, rewriteId: string): string {
  return path.join(path.dirname(modulePath), `.dotfiles-runtime-imports-${rewriteId}`);
}

function createAliasedSourcePath(source: string, originalSpecifier: string, rewrittenSpecifier: string): string {
  let rewrittenSource = source;

  rewrittenSource = rewrittenSource.replaceAll(`"${originalSpecifier}"`, `"${rewrittenSpecifier}"`);
  rewrittenSource = rewrittenSource.replaceAll(`'${originalSpecifier}'`, `'${rewrittenSpecifier}'`);

  return rewrittenSource;
}

function createMirroredModulePath(mirrorRootDir: string, originalModulePath: string): string {
  const rootPath = path.parse(originalModulePath).root;
  const relativeModulePath = path.relative(rootPath, originalModulePath);
  return path.join(mirrorRootDir, relativeModulePath);
}

function createRelativeModuleSpecifier(fromFilePath: string, toFilePath: string): string {
  const relativePath = path.relative(path.dirname(fromFilePath), toFilePath).replaceAll(path.sep, "/");

  if (relativePath.startsWith(".")) {
    return relativePath;
  }

  return `./${relativePath}`;
}

function getAliasedModulePath(mirrorRootDir: string): string {
  return path.join(mirrorRootDir, "dotfiles-runtime-alias.mjs");
}

function getResolvedJsExtensionCandidates(modulePath: string): string[] {
  const extension = path.extname(modulePath);

  if (extension === ".js") {
    return [modulePath, `${modulePath.slice(0, -3)}.ts`, `${modulePath.slice(0, -3)}.tsx`];
  }

  if (extension === ".jsx") {
    return [modulePath, `${modulePath.slice(0, -4)}.tsx`, `${modulePath.slice(0, -4)}.ts`];
  }

  return [modulePath];
}

function isDirectoryImportSpecifier(specifier: string): boolean {
  return specifier.endsWith("/");
}

function isLocalImportSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file://")
  );
}

function isRuntimeAliasSpecifier(specifier: string): boolean {
  return RUNTIME_ALIAS_SPECIFIERS.includes(specifier as (typeof RUNTIME_ALIAS_SPECIFIERS)[number]);
}

function normalizeImportSpecifierBasePath(importerPath: string, specifier: string): string {
  if (specifier.startsWith("file://")) {
    return fileURLToPath(specifier);
  }

  if (path.isAbsolute(specifier)) {
    return specifier;
  }

  return path.resolve(path.dirname(importerPath), specifier);
}

async function pathExists(filePath: string): Promise<boolean> {
  return await nodeFileSystem.exists(filePath);
}

async function resolveLocalImportPath(importerPath: string, specifier: string): Promise<string | undefined> {
  const basePath = normalizeImportSpecifierBasePath(importerPath, specifier);

  if (path.extname(basePath) || isDirectoryImportSpecifier(specifier)) {
    const directResolution = await resolvePathCandidates(getResolvedJsExtensionCandidates(basePath));
    if (directResolution) {
      return directResolution;
    }
  }

  const directFileResolution = await resolvePathCandidates(
    EXTENSION_RESOLUTION_ORDER.map((extension) => `${basePath}${extension}`),
  );
  if (directFileResolution) {
    return directFileResolution;
  }

  const indexFileResolution = await resolvePathCandidates(
    EXTENSION_RESOLUTION_ORDER.map((extension) => path.join(basePath, `index${extension}`)),
  );
  return indexFileResolution;
}

async function resolvePathCandidates(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function scanModuleGraph(entryModulePath: string): Promise<IModuleGraphScanResult> {
  const modules = new Map<string, IModuleGraphNode>();
  const pendingPaths: string[] = [entryModulePath];
  let hasRuntimeAliasSpecifier = false;

  while (pendingPaths.length > 0) {
    const currentModulePath = pendingPaths.pop();
    if (!currentModulePath || modules.has(currentModulePath)) {
      continue;
    }

    const source = await nodeFileSystem.readFile(currentModulePath);
    const imports: IModuleImport[] = [];
    const transpilerLoader = resolveTranspilerLoader(currentModulePath);

    if (transpilerLoader) {
      const transpiler = new Bun.Transpiler({ loader: transpilerLoader });

      for (const scannedImport of transpiler.scanImports(source)) {
        const specifier = scannedImport.path;
        const resolvedModulePath = isLocalImportSpecifier(specifier)
          ? await resolveLocalImportPath(currentModulePath, specifier)
          : undefined;

        if (isRuntimeAliasSpecifier(specifier)) {
          hasRuntimeAliasSpecifier = true;
        }

        if (resolvedModulePath) {
          pendingPaths.push(resolvedModulePath);
        }

        imports.push({
          resolvedModulePath,
          specifier,
        });
      }
    }

    modules.set(currentModulePath, {
      imports,
      mirroredModulePath: "",
      originalModulePath: currentModulePath,
      source,
    });
  }

  return {
    hasRuntimeAliasSpecifier,
    modules,
  };
}

function resolveTranspilerLoader(modulePath: string): TranspilerLoader | undefined {
  const extension = path.extname(modulePath);

  if (extension === ".ts" || extension === ".mts" || extension === ".cts") {
    return "ts";
  }

  if (extension === ".tsx") {
    return "tsx";
  }

  if (extension === ".jsx" || extension === ".js") {
    return "jsx";
  }

  if (extension === ".mjs" || extension === ".cjs") {
    return "js";
  }

  return undefined;
}

function shouldRewriteLocalImport(specifier: string): boolean {
  return specifier.startsWith("/") || specifier.startsWith("file://");
}

async function createRewrittenModuleGraph(modulePath: string): Promise<IRewrittenModuleGraph | null> {
  const scanResult = await scanModuleGraph(modulePath);
  if (!scanResult.hasRuntimeAliasSpecifier) {
    return null;
  }

  const rewriteId = crypto.randomUUID().slice(0, 8);
  const mirrorRootDir = createMirrorRootPath(modulePath, rewriteId);
  const aliasModulePath = getAliasedModulePath(mirrorRootDir);

  await nodeFileSystem.ensureDir(path.dirname(aliasModulePath));
  await nodeFileSystem.writeFile(aliasModulePath, RUNTIME_ALIAS_MODULE_SOURCE);

  for (const graphNode of scanResult.modules.values()) {
    graphNode.mirroredModulePath = createMirroredModulePath(mirrorRootDir, graphNode.originalModulePath);
  }

  for (const graphNode of scanResult.modules.values()) {
    let rewrittenSource = graphNode.source;
    const relativeAliasPath = createRelativeModuleSpecifier(graphNode.mirroredModulePath, aliasModulePath);

    for (const runtimeAliasSpecifier of RUNTIME_ALIAS_SPECIFIERS) {
      rewrittenSource = createAliasedSourcePath(rewrittenSource, runtimeAliasSpecifier, relativeAliasPath);
    }

    for (const moduleImport of graphNode.imports) {
      if (!moduleImport.resolvedModulePath || !shouldRewriteLocalImport(moduleImport.specifier)) {
        continue;
      }

      const mirroredImportNode = scanResult.modules.get(moduleImport.resolvedModulePath);
      if (!mirroredImportNode) {
        continue;
      }

      const rewrittenSpecifier = createRelativeModuleSpecifier(
        graphNode.mirroredModulePath,
        mirroredImportNode.mirroredModulePath,
      );
      rewrittenSource = createAliasedSourcePath(rewrittenSource, moduleImport.specifier, rewrittenSpecifier);
    }

    await nodeFileSystem.ensureDir(path.dirname(graphNode.mirroredModulePath));
    await nodeFileSystem.writeFile(graphNode.mirroredModulePath, rewrittenSource);
  }

  const rewrittenEntryNode = scanResult.modules.get(modulePath);
  if (!rewrittenEntryNode) {
    return null;
  }

  return {
    entryModulePath: rewrittenEntryNode.mirroredModulePath,
    rootDir: mirrorRootDir,
  };
}

async function cleanupRewrittenModuleGraph(rewrittenModuleGraph: IRewrittenModuleGraph | null): Promise<void> {
  if (!rewrittenModuleGraph) {
    return;
  }

  await nodeFileSystem.rm(rewrittenModuleGraph.rootDir, { force: true, recursive: true });
}

export async function importModuleWithRuntimeAliases(modulePath: string): Promise<unknown> {
  const rewrittenModuleGraph = await createRewrittenModuleGraph(modulePath);
  const importPath = rewrittenModuleGraph?.entryModulePath ?? modulePath;

  try {
    return await import(importPath);
  } finally {
    await cleanupRewrittenModuleGraph(rewrittenModuleGraph);
  }
}
