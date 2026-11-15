import { type JSX } from "preact";
import { Button } from "./ui/Button";

interface IRequestStateNoticeProps {
  label: string;
  loading: boolean;
  error: Error | null;
  hasData: boolean;
  onRetry: () => void;
}

export function RequestStateNotice({
  label,
  loading,
  error,
  hasData,
  onRetry,
}: IRequestStateNoticeProps): JSX.Element | null {
  if (loading) {
    return (
      <div
        data-testid="RequestStateNotice"
        role="status"
        class="rounded-md border border-border p-3 text-sm text-foreground"
      >
        {hasData ? `Refreshing ${label.toLowerCase()}…` : `Loading ${label.toLowerCase()}…`}
      </div>
    );
  }
  if (!error) return null;

  return (
    <div
      data-testid="RequestStateNotice"
      role="alert"
      class="space-y-2 rounded-md border border-destructive p-3 text-sm text-foreground"
    >
      <p class="font-medium">{label} could not be loaded.</p>
      <p class="break-words">{error.message}</p>
      {hasData && <p>Showing previously loaded data. It may be out of date.</p>}
      <Button type="button" variant="outline" onClick={onRetry} aria-label={`Retry ${label.toLowerCase()}`}>
        Retry
      </Button>
    </div>
  );
}
