import type { ComponentChildren, JSX } from "preact";

import { ToolActionsContext } from "../operations/ToolActionsContext";
import { useToolActionState } from "../hooks/useToolActionState";
import { OperationStatus } from "./OperationStatus";

type ToolActionsProviderProps = {
  children?: ComponentChildren;
};

export function ToolActionsProvider({ children }: ToolActionsProviderProps): JSX.Element {
  const actions = useToolActionState();
  return (
    <ToolActionsContext.Provider value={actions}>
      <OperationStatus actions={actions} />
      {children}
    </ToolActionsContext.Provider>
  );
}
