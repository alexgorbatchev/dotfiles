import { type JSX } from "preact";
import { LocationProvider, Route, Router } from "preact-iso";

import { CommandPalette } from "./components/CommandPalette";
import { Nav } from "./components/Nav";
import { Health } from "./pages/Health";
import { NotFound } from "./pages/NotFound";
import { Settings } from "./pages/Settings";
import { ToolDetail } from "./pages/ToolDetail";
import { Tools } from "./pages/Tools";

export function App(): JSX.Element {
  return (
    <LocationProvider>
      <div class="min-h-screen bg-background text-foreground">
        <Nav />
        <main class="max-w-7xl mx-auto px-4 py-6">
          <Router>
            <Route path="/" component={Tools} />
            <Route path="/tools/:name" component={ToolDetail} />
            <Route path="/health" component={Health} />
            <Route path="/settings" component={Settings} />
            <Route default component={NotFound} />
          </Router>
        </main>
        <CommandPalette />
      </div>
    </LocationProvider>
  );
}
