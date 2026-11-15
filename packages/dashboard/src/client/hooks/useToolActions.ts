import { useContext } from "preact/hooks";
import { ToolActionsContext } from "../operations/ToolActionsContext";
import type { IUseToolActions } from "../operations/types";

export type {
  IToolActionOutcome,
  IToolActionPending,
  IToolActionRequest,
  IToolActionResult,
  IUseToolActions,
  ToolActionKind,
  ToolActionTone,
} from "../operations/types";

export function useToolActions(): IUseToolActions {
  const actions = useContext(ToolActionsContext);
  if (!actions) throw new Error("useToolActions requires ToolActionsProvider");
  return actions;
}
