import type { IToolDetail } from "../../../shared/types";

export const fixture_inventoryTool: IToolDetail = {
  config: { name: "example", installationMethod: "manual" },
  runtime: { status: "installed", installedVersion: "1", installedAt: null, installPath: null, binaryPaths: [] },
  files: [],
  binaryDiskSize: 0,
  usage: { totalCount: 0, binaries: [] },
};
