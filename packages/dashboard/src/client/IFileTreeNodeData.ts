export interface IFileTreeNodeData {
  name: string;
  path: string;
  type: "file" | "directory";
  fileType?: string;
  children?: IFileTreeNodeData[];
}
