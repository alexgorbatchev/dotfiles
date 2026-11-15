import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { Copy } from "../icons";
import { Button } from "./ui/Button";

type CopyButtonProps = {
  text: string;
  label: string;
};

export function CopyButton({ text, label }: CopyButtonProps): JSX.Element {
  const [message, setMessage] = useState("");

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied to clipboard.");
    } catch {
      setMessage("Clipboard unavailable. Select and copy the text instead.");
    }
  }

  return (
    <span data-testid="CopyButton" class="inline-flex flex-wrap items-center gap-2 text-sm">
      <Button variant="outline" size="sm" onClick={copy}>
        <Copy class="size-4" aria-hidden="true" /> {label}
      </Button>
      <span role="status" aria-live="polite">
        {message}
      </span>
    </span>
  );
}
