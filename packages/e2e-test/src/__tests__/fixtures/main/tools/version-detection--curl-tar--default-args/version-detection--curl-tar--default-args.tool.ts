import { defineTool } from "@dotfiles/cli";

const mockServerHost = process.env["MOCK_SERVER_PORT"]
  ? `http://127.0.0.1:${process.env["MOCK_SERVER_PORT"]}`
  : "http://127.0.0.1:8765";

export default defineTool((install) => {
  return install("curl-tar", {
    url: `${mockServerHost}/mock-install-version-detection-curl-tar-default-args.tar.gz`,
    env: {
      INSTALL_DIR: "{stagingDir}",
    },
  }).bin("version-detection--curl-tar--default-args");
});
