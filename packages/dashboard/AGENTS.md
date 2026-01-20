# @dotfiles/dashboard

Web-based visualization dashboard for the dotfiles-tool-installer system.

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
