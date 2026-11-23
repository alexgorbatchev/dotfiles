import { type JSX } from "preact";
import type { ToolRuntimeStatus } from "../../shared/types";

import { Badge } from "./ui/Badge";

interface IStatusBadgeProps {
  status: ToolRuntimeStatus;
}

export function StatusBadge({ status }: IStatusBadgeProps): JSX.Element {
  switch (status) {
    case "installed":
      return <Badge variant="success">✓ Installed</Badge>;
    case "not-installed":
      return <Badge variant="secondary">Not installed</Badge>;
    case "error":
      return <Badge variant="error">Error</Badge>;
  }
}
