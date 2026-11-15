import { createContext } from "preact";
import type { IUseToolActions } from "./types";

export const ToolActionsContext = createContext<IUseToolActions | null>(null);
