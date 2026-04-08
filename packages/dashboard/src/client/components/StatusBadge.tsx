import { type JSX } from "preact";

import { Badge } from "./ui/Badge";

type ToolStatus = "installed" | "not-installed" | "error";

interface IStatusBadgeProps {
  status: ToolStatus;
}

export function StatusBadge({ status }: IStatusBadgeProps): JSX.Element {
  switch (status) {
    case "installed":
      return <Badge variant="success">✓ Installed</Badge>;
    case "not-installed":
      return <Badge variant="error">Not Installed</Badge>;
    case "error":
      return <Badge variant="error">Error</Badge>;
  }
}
