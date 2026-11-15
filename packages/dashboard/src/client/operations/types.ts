export type ToolActionKind = "install" | "update" | "check";
export type ToolActionTone = "success" | "error" | "info";

export interface IToolActionRequest {
  toolName: string;
  kind: ToolActionKind;
  force?: boolean;
}

export interface IToolActionPending extends IToolActionRequest {
  startedAt: number;
}

export interface IToolActionOutcome {
  toolName: string;
  kind: ToolActionKind;
  message: string;
  tone: ToolActionTone;
}

export interface IToolActionResult {
  id: number;
  request: IToolActionRequest;
  outcome: IToolActionOutcome;
  elapsedSeconds: number;
}

export interface IUseToolActions {
  pending: IToolActionPending | null;
  results: IToolActionResult[];
  dismissResult: (id: number) => void;
  retryResult: (id: number) => Promise<void>;
  installTool: (toolName: string, force: boolean) => Promise<void>;
  updateTool: (toolName: string) => Promise<void>;
  checkTool: (toolName: string) => Promise<void>;
}
