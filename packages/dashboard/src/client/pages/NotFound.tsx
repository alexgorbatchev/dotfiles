import { type JSX } from "preact";

import { Button } from "../components/ui/Button";

export function NotFound(): JSX.Element {
  return (
    <div class="text-center py-8">
      <h1 class="text-2xl font-bold mb-4">404 - Not Found</h1>
      <Button variant="link" asChild>
        <a href="/">Go to Dashboard</a>
      </Button>
    </div>
  );
}
