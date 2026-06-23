import { createBaseRuntimeContext } from "../packages/cli/src/runtime/createBaseRuntimeContext";
import { loadToolConfigs } from "../packages/config/src/loadToolConfigs";
import { NodeFileSystem } from "../packages/file-system/src/NodeFileSystem";
import { ResolvedFileSystem } from "../packages/file-system/src/ResolvedFileSystem";
import { TestLogger } from "../packages/logger/src/TestLogger";

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    process.stderr.write("Config path required\n");
    process.exit(1);
  }

  const logger = new TestLogger();
  const nodeFs = new NodeFileSystem();

  const context = await createBaseRuntimeContext(logger, {
    config: configPath,
    cwd: process.cwd(),
    env: process.env,
    fileSystem: nodeFs,
  });

  if (!context) {
    process.stderr.write("Failed to load context\n");
    process.exit(1);
  }

  const { projectConfig, systemInfo } = context;

  const fs = new ResolvedFileSystem(nodeFs, projectConfig.paths.homeDir);
  const toolConfigs = await loadToolConfigs(logger, projectConfig.paths.toolConfigsDir, fs, projectConfig, systemInfo);

  process.stdout.write(JSON.stringify({ projectConfig, toolConfigs }) + "\n");
}

await main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
