# @dotfiles/dashboard

Web-based visualization dashboard for the dotfiles-tool-installer system.

## Component Source

UI components should be adopted from [shadcn-preact](https://github.com/LiasCode/shadcn-preact/tree/main/src/components/ui).

## Package Structure

```
src/
├── server/           # Bun HTTP server and REST API
│   ├── index.ts      # Server entry point and static file serving
│   ├── routes/       # API route handlers
│   └── services/     # Service container for dependency injection
├── client/           # Preact frontend application
│   ├── index.html    # HTML entry point with Tailwind CSS
│   ├── main.tsx      # Preact app entry and routing
│   ├── components/   # Reusable UI components
│   └── pages/        # Page components for each route
└── shared/           # Shared types between server and client
    └── types.ts      # API response types and data models
```

## Key Interfaces

- `IDashboardServer` - Server interface for starting/stopping the dashboard
- `IDashboardServices` - Service container for registry access
- `IApiResponse<T>` - Standard API response wrapper

## Testing

Tests use mock registries and file systems. The server tests verify:

- API endpoint responses
- Error handling
- Data transformation from registry to API models

## UI Component Testing

UI tests use `@testing-library/preact` with `happy-dom` for DOM simulation. The setup is handled by importing from `src/testing/ui-setup.ts` and calling `setupUITests()`.

### Creating a UI Test

```tsx
// Import setup FIRST - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests, userEvent } from '../../../../testing/ui-setup';

import { describe, expect, test } from 'bun:test';

import { MyComponent } from '../MyComponent';

// REQUIRED: Register cleanup hooks for this test file
setupUITests();

describe('MyComponent', () => {
  test('renders correctly', () => {
    render(<MyComponent label='Hello' />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  test('handles click events', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});
```

### Key Points

- **Import order matters**: `ui-setup.ts` must be the first import to register DOM before testing-library loads
- **setupUITests() is required**: Call at top level of each test file to register cleanup hooks
- **Available exports**: `render`, `screen`, `fireEvent`, `userEvent`, `setupUITests`
- **jest-dom matchers**: Automatically extended (e.g., `toBeInTheDocument()`, `toHaveClass()`)
- **Cleanup**: Handled by `setupUITests()` - clears DOM before/after each test

### Running Tests

```bash
# Run all tests (UI tests work with standard bun test)
bun test

# Run only UI tests
bun test packages/dashboard/src/client
```
