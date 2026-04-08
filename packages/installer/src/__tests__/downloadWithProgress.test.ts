import { beforeEach, describe, expect, it } from "bun:test";
import { downloadWithProgress } from "../utils/downloadWithProgress";
import { createInstallerTestSetup, type IInstallerTestSetup } from "./installer-test-helpers";

describe("downloadWithProgress utility", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it("should call downloader.download with correct parameters", async () => {
    const url = "https://example.com/test-file.tar.gz";
    const destinationPath = "/tmp/test-file.tar.gz";
    const filename = "test-file.tar.gz";

    await downloadWithProgress(setup.logger, url, destinationPath, filename, setup.mocks.downloader, undefined);

    expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
      expect.anything(),
      url,
      expect.objectContaining({
        destinationPath,
      }),
    );

    // Verify downloader was called with correct parameters (logger is mocked)
    expect(setup.mocks.downloader.download).toHaveBeenCalled();
  });
});
