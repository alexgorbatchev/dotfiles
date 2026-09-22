import { defineTool } from "@dotfiles/cli";

const mockServerHost = process.env["MOCK_SERVER_PORT"]
  ? `http://127.0.0.1:${process.env["MOCK_SERVER_PORT"]}`
  : "http://127.0.0.1:8765";

export default defineTool((install) =>
  install("curl-script", {
    url: `${mockServerHost}/mock-install-curl-script-binary-path.sh`,
    shell: "sh",
    binaryPath: "~/.local/bin/curl-script--binary-path",
    env: (ctx) => ({ MOCK_HOME: ctx.projectConfig.paths.homeDir }),
    versionArgs: ["--version"],
    versionRegex: "curl-script--binary-path (\\d+\\.\\d+\\.\\d+)",
  })
    .version("latest")
    .bin("curl-script--binary-path"),
);
