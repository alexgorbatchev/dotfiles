import { LocationProvider, Route, Router } from 'preact-iso';
import { Nav } from './components/Nav';
import { Dashboard } from './pages/Dashboard';
import { Health } from './pages/Health';
import { NotFound } from './pages/NotFound';
import { Settings } from './pages/Settings';
import { ToolDetail } from './pages/ToolDetail';
import { Tools } from './pages/Tools';

export function App() {
  return (
    <LocationProvider>
      <div class='min-h-screen bg-gray-900 text-gray-100'>
        <Nav />
        <main class='max-w-7xl mx-auto px-4 py-6'>
          <Router>
            <Route path='/' component={Dashboard} />
            <Route path='/tools' component={Tools} />
            <Route path='/tools/:name' component={ToolDetail} />
            <Route path='/health' component={Health} />
            <Route path='/settings' component={Settings} />
            <Route default component={NotFound} />
          </Router>
        </main>
      </div>
    </LocationProvider>
  );
}
