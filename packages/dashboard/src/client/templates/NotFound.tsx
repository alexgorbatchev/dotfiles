import { type JSX } from "preact";

import { Button } from "../components/ui/Button";

export function NotFound(): JSX.Element {
  return (
    <div data-testid="NotFound" class="py-8 text-center">
      <h1 class="mb-4 text-2xl font-bold">404 - Not Found</h1>
      <Button variant="link" asChild>
        <a href="/">Go to Dashboard</a>
      </Button>
    </div>
  );
}
