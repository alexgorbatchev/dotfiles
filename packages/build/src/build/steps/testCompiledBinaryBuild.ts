import fs from "node:fs";
import path from "node:path";
import { BuildError } from "../handleBuildError";
import type { IBuildContext } from "../types";

const DASHBOARD_TEST_PORT = 13580;
const STARTUP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

type BunProcess = ReturnType<typeof Bun.spawn>;

interface ICompiledBinarySmokeProject {
  rootDir: string;
  configPath: string;
  generatedDir: string;
  packageJsonPath: string;
  tsConfigPath: string;
  cleanup: () => void;
}

interface IProcessOutput {
  stdout: string;
  stderr: string;
}

interface IRunBinaryCommandResult extends IProcessOutput {
  exitCode: number;
}

interface IEndpointVerification {
  url: string;
  expectedContentType: string;
  label: string;
  validateContent?: (content: string) => string | null;
}

type AssetTagName = "script" | "link";
type AssetAttributeName = "src" | "href";

type HealthResponseLike = { success?: boolean };
type ToolsResponseLike = {
  success?: boolean;
  data?: Array<{
    config?: {
      name?: string;
    };
  }>;
};

function createCompiledBinarySmokeProject(context: IBuildContext): ICompiledBinarySmokeProject {
  const testId = crypto.randomUUID().slice(0, 8);
  const rootDir = path.join(context.paths.tmpDir, `compiled-binary-smoke-${testId}`);
  const configHelpersDir = path.join(rootDir, "config");
  const toolsDir = path.join(rootDir, "tools");
  const toolHelpersDir = path.join(toolsDir, "helpers");
  const configPath = path.join(rootDir, "dotfiles.config.ts");
  const configHelperPath = path.join(configHelpersDir, "createSmokeConfig.ts");
  const toolConfigPath = path.join(toolsDir, "demo-tool.tool.ts");
  const toolHelperPath = path.join(toolHelpersDir, "createDemoTool.ts");
  const generatedDir = path.join(rootDir, ".generated");
  const packageJsonPath = path.join(rootDir, "package.json");
  const tsConfigPath = path.join(rootDir, "tsconfig.json");

  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.mkdirSync(configHelpersDir, { recursive: true });
  fs.mkdirSync(toolHelpersDir, { recursive: true });

  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(
      {
        name: "compiled-binary-smoke-project",
        private: true,
        type: "module",
        scripts: {
          typecheck: "tsgo --noEmit -p tsconfig.json",
        },
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    tsConfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["ESNext", "DOM"],
          target: "ESNext",
          module: "ESNext",
          moduleDetection: "force",
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          noEmit: true,
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          noFallthroughCasesInSwitch: true,
          noUncheckedIndexedAccess: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noPropertyAccessFromIndexSignature: true,
          noImplicitAny: true,
        },
        include: ["./dotfiles.config.ts", "tools", ".generated/tool-types.d.ts"],
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    configPath,
    [
      'import { createSmokeConfig } from "./config/createSmokeConfig";',
      "",
      "export default createSmokeConfig();",
      "",
    ].join("\n"),
  );

  fs.writeFileSync(
    configHelperPath,
    [
      'import { defineConfig } from "@alexgorbatchev/dotfiles";',
      "",
      "export function createSmokeConfig() {",
      "  return defineConfig(() => ({",
      "  paths: {",
      '    dotfilesDir: "{configFileDir}",',
      '    generatedDir: "{configFileDir}/.generated",',
      '    homeDir: "{HOME}",',
      '    targetDir: "{configFileDir}/bin",',
      '    toolConfigsDir: "{configFileDir}/tools",',
      '    shellScriptsDir: "{configFileDir}/.generated/shell-scripts",',
      '    binariesDir: "{configFileDir}/.generated/binaries",',
      "  },",
      "  }));",
      "}",
      "",
    ].join("\n"),
  );

  fs.writeFileSync(
    toolConfigPath,
    ['import { createDemoTool } from "./helpers/createDemoTool";', "", "export default createDemoTool();", ""].join(
      "\n",
    ),
  );

  fs.writeFileSync(
    toolHelperPath,
    [
      'import { defineTool, Platform } from "@dotfiles/cli";',
      "",
      "export function createDemoTool() {",
      "  return defineTool((install, ctx) =>",
      '    install("manual", { binaryPath: ctx.systemInfo.platform === Platform.Linux ? "/usr/bin/env" : "/usr/bin/env" })',
      '      .bin("demo-tool")',
      '      .version("1.0.0"),',
      "  );",
      "}",
      "",
    ].join("\n"),
  );

  return {
    rootDir,
    configPath,
    generatedDir,
    packageJsonPath,
    tsConfigPath,
    cleanup: () => {
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

async function testGeneratedTypecheck(project: ICompiledBinarySmokeProject, context: IBuildContext): Promise<void> {
  console.log("🧪 Testing compiled-binary generated authoring types...");

  const typecheckProcess = Bun.spawn({
    cmd: [path.join(context.paths.rootNodeModulesPath, ".bin", "tsgo"), "--noEmit", "-p", project.tsConfigPath],
    cwd: project.rootDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await typecheckProcess.exited;
  const output = await getProcessOutput(typecheckProcess);

  if (exitCode !== 0) {
    throw new BuildError(
      `Compiled generated typecheck failed with exit code ${exitCode}\nstderr: ${output.stderr}\nstdout: ${output.stdout}`,
    );
  }
}

async function getProcessOutput(process: BunProcess): Promise<IProcessOutput> {
  const stderr = process.stderr instanceof ReadableStream ? await new Response(process.stderr).text() : "";
  const stdout = process.stdout instanceof ReadableStream ? await new Response(process.stdout).text() : "";
  return { stdout, stderr };
}

async function runBinaryCommand(binaryPath: string, args: string[], cwd: string): Promise<IRunBinaryCommandResult> {
  const process = Bun.spawn({
    cmd: [binaryPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await process.exited;
  const output = await getProcessOutput(process);

  return {
    exitCode,
    ...output,
  };
}

async function verifyEndpoint(config: IEndpointVerification): Promise<string> {
  const response = await fetch(config.url);

  if (!response.ok) {
    throw new BuildError(`${config.label} returned status ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type");
  if (!contentType?.includes(config.expectedContentType)) {
    throw new BuildError(`${config.label} returned wrong content type: ${contentType}`);
  }

  const content = await response.text();

  if (config.validateContent) {
    const error = config.validateContent(content);
    if (error) {
      throw new BuildError(error);
    }
  }

  return content;
}

function validateNotHtml(content: string, label: string): string | null {
  if (content.startsWith("<!DOCTYPE") || content.startsWith("<html")) {
    return `${label} returned HTML instead of expected content`;
  }

  return null;
}

function extractAssetUrl(html: string, tagName: AssetTagName, attributeName: AssetAttributeName): string {
  const pattern = new RegExp(`<${tagName}[^>]+${attributeName}="([^"]+)"`, "i");
  const match = html.match(pattern);

  if (!match?.[1]) {
    throw new BuildError(`Dashboard HTML did not include a ${tagName} ${attributeName} asset`);
  }

  return match[1];
}

async function waitForServerReady(port: number, serverProcess: BunProcess): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
    if (serverProcess.exitCode !== null) {
      const { stdout, stderr } = await getProcessOutput(serverProcess);
      throw new BuildError(
        `Compiled dashboard process exited with code ${serverProcess.exitCode}\nstderr: ${stderr}\nstdout: ${stdout}`,
      );
    }

    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }

  serverProcess.kill();
  const { stdout, stderr } = await getProcessOutput(serverProcess);
  throw new BuildError(
    `Compiled dashboard failed to start within ${STARTUP_TIMEOUT_MS}ms\nstderr: ${stderr}\nstdout: ${stdout}`,
  );
}

async function testGenerateCommand(binaryPath: string, project: ICompiledBinarySmokeProject): Promise<void> {
  console.log("🧪 Testing generate command from compiled binary...");

  const result = await runBinaryCommand(binaryPath, ["--config", project.configPath, "generate"], project.rootDir);

  if (result.exitCode !== 0) {
    throw new BuildError(
      `Compiled generate command failed with exit code ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );
  }

  const toolTypesPath = path.join(project.generatedDir, "tool-types.d.ts");
  const authoringTypesPath = path.join(project.generatedDir, "authoring-types.d.ts");
  const shellScriptPath = path.join(project.generatedDir, "shell-scripts", "main.zsh");

  if (!fs.existsSync(toolTypesPath)) {
    throw new BuildError(`Compiled generate command did not create ${toolTypesPath}`);
  }

  if (!fs.existsSync(authoringTypesPath)) {
    throw new BuildError(`Compiled generate command did not create ${authoringTypesPath}`);
  }

  if (!fs.existsSync(shellScriptPath)) {
    throw new BuildError(`Compiled generate command did not create ${shellScriptPath}`);
  }

  const toolTypesContent = fs.readFileSync(toolTypesPath, "utf8");
  if (!toolTypesContent.includes('/// <reference path="./authoring-types.d.ts" />')) {
    throw new BuildError("Compiled generate command did not reference generated authoring types");
  }
}

async function testDashboardCommand(binaryPath: string, project: ICompiledBinarySmokeProject): Promise<void> {
  console.log("🧪 Testing dashboard from compiled binary...");

  const serverProcess = Bun.spawn({
    cmd: [binaryPath, "--config", project.configPath, "dashboard", "--port", String(DASHBOARD_TEST_PORT), "--no-open"],
    cwd: project.rootDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    await waitForServerReady(DASHBOARD_TEST_PORT, serverProcess);

    const healthContent = await verifyEndpoint({
      url: `http://localhost:${DASHBOARD_TEST_PORT}/api/health`,
      expectedContentType: "application/json",
      label: "Compiled dashboard API",
    });
    const healthData: HealthResponseLike = JSON.parse(healthContent);
    if (!healthData.success) {
      throw new BuildError("Compiled dashboard API health check failed");
    }

    const toolsContent = await verifyEndpoint({
      url: `http://localhost:${DASHBOARD_TEST_PORT}/api/tools`,
      expectedContentType: "application/json",
      label: "Compiled dashboard tools API",
    });
    const toolsData: ToolsResponseLike = JSON.parse(toolsContent);
    const toolName = toolsData.data?.[0]?.config?.name;
    if (!toolsData.success || toolName !== "demo-tool") {
      throw new BuildError("Compiled dashboard tools API did not load the smoke-test tool config");
    }

    const html = await verifyEndpoint({
      url: `http://localhost:${DASHBOARD_TEST_PORT}/`,
      expectedContentType: "text/html",
      label: "Compiled dashboard root",
      validateContent: (content) => {
        if (!content.toLowerCase().includes("<!doctype html>")) {
          return "Compiled dashboard root did not return valid HTML";
        }

        if (!content.includes("Dotfiles Dashboard")) {
          return "Compiled dashboard HTML missing expected title";
        }

        return null;
      },
    });

    const jsAssetUrl = new URL(extractAssetUrl(html, "script", "src"), `http://localhost:${DASHBOARD_TEST_PORT}/`).href;
    const cssAssetUrl = new URL(extractAssetUrl(html, "link", "href"), `http://localhost:${DASHBOARD_TEST_PORT}/`).href;

    await verifyEndpoint({
      url: jsAssetUrl,
      expectedContentType: "javascript",
      label: "Compiled dashboard JavaScript asset",
      validateContent: (content) => validateNotHtml(content, "Compiled dashboard JavaScript asset"),
    });

    await verifyEndpoint({
      url: cssAssetUrl,
      expectedContentType: "text/css",
      label: "Compiled dashboard CSS asset",
      validateContent: (content) => validateNotHtml(content, "Compiled dashboard CSS asset"),
    });
  } finally {
    serverProcess.kill();
    await serverProcess.exited;
  }
}

/**
 * Tests the standalone Bun executable against a real config and tool project.
 */
export async function testCompiledBinaryBuild(context: IBuildContext): Promise<void> {
  console.log("📦 Creating compiled binary smoke project...");

  if (!fs.existsSync(context.paths.compiledBinaryOutputFile)) {
    throw new BuildError(`Compiled binary not found at ${context.paths.compiledBinaryOutputFile}`);
  }

  const project = createCompiledBinarySmokeProject(context);

  try {
    await testGenerateCommand(context.paths.compiledBinaryOutputFile, project);
    await testGeneratedTypecheck(project, context);
    await testDashboardCommand(context.paths.compiledBinaryOutputFile, project);
    console.log("✅ Compiled binary tests passed");
  } finally {
    project.cleanup();
  }
}
