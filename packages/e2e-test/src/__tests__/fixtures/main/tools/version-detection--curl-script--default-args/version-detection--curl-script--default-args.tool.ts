import { defineTool } from "@dotfiles/cli";

const mockServerHost = process.env["MOCK_SERVER_PORT"]
  ? `http://127.0.0.1:${process.env["MOCK_SERVER_PORT"]}`
  : "http://127.0.0.1:8765";

export default defineTool((install) => {
  return install("curl-script", {
    url: `${mockServerHost}/mock-install-version-detection-curl-script-default-args.sh`,
    shell: "sh",
    env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
  }).bin("version-detection--curl-script--default-args");
});
