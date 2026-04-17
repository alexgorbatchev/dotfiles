import { defineTool } from "@dotfiles/cli";
import path from "node:path";

const mockServerHost = process.env["MOCK_SERVER_PORT"]
  ? `http://127.0.0.1:${process.env["MOCK_SERVER_PORT"]}`
  : "http://127.0.0.1:8765";
const workerId = process.env["BUN_TEST_WORKER_ID"] ?? "default";
const binaryPath =
  process.env["DOTFILES_TEST_PKG_BINARY_PATH"] ||
  path.join(import.meta.dirname, "..", "..", "build", "installed", workerId, "bin", "pkg-test-tool");

export default defineTool((install) =>
  install("pkg", {
    source: {
      type: "url",
      url: `${mockServerHost}/pkg-test-tool.pkg`,
    },
    binaryPath,
  })
    .bin("pkg-test-tool")
    .version("1.0.0"),
);
