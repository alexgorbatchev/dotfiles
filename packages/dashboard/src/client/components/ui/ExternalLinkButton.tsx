import { type JSX } from "preact";
import { ExternalLink } from "../../icons";

import { Button } from "./Button";

interface ExternalLinkButtonProps {
  href: string;
  children: JSX.Element | string;
}

export function ExternalLinkButton({ href, children }: ExternalLinkButtonProps): JSX.Element {
  return (
    <Button variant="outline" size="sm" asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <ExternalLink class="h-4 w-4" />
        {children}
      </a>
    </Button>
  );
}
