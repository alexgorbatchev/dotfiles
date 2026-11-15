import type { IToolDetail } from "../../shared/types";

export interface IInventoryQuery {
  q: string;
  status: string;
  method: string;
  root: string;
  sort: string;
}

export interface IInventorySource {
  rootPath: string;
  rootLabel: string;
  relativePath: string;
  path: string;
}

export interface IInventoryRow {
  tool: IToolDetail;
  binaries: string[];
  sources: IInventorySource[];
}
