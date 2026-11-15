import { type JSX } from "preact";
import { useState } from "preact/hooks";
import { LocationProvider, Route, Router } from "preact-iso";

import { CommandPalette } from "../components/CommandPalette";
import { Nav } from "../components/Nav";
import { ToolActionsProvider } from "../components/ToolActionsProvider";
import { Health } from "../templates/Health";
import { NotFound } from "../templates/NotFound";
import { Settings } from "../templates/Settings";
import { ToolDetail } from "../templates/ToolDetail";
import { Tools } from "../templates/Tools";

export function App(): JSX.Element {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <LocationProvider>
      <div class="min-h-screen bg-background text-foreground">
        <Nav onSearch={() => setSearchOpen(true)} />
        <main aria-label="Dashboard content" class="max-w-7xl mx-auto min-w-0 px-4 py-6">
          <ToolActionsProvider>
            <Router>
              <Route path="/" component={Tools} />
              <Route path="/tools/:name" component={ToolDetail} />
              <Route path="/health" component={Health} />
              <Route path="/settings" component={Settings} />
              <Route default component={NotFound} />
            </Router>
          </ToolActionsProvider>
        </main>
        <CommandPalette isOpen={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </LocationProvider>
  );
}
