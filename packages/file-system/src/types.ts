export type FileWriteContent = string | NodeJS.ArrayBufferView;

export interface IRecursiveDirectoryOptions {
  recursive?: boolean;
}

export interface IRemoveOptions extends IRecursiveDirectoryOptions {
  force?: boolean;
}

export type SymlinkKind = "file" | "dir" | "junction";

export type FileMode = number | string;
