---
name: bun-server
description: Bun.serve HTTP server patterns and API reference. Use when creating HTTP servers, REST APIs, WebSocket handlers, or configuring server options in Bun. Covers routing, static responses, dynamic routes, TLS, lifecycle methods, and server metrics.
---

# Bun Server

## Basic Setup

```typescript
const server = Bun.serve({
  routes: {
    // Static response
    '/api/status': new Response('OK'),

    // Dynamic route with params
    '/users/:id': (req) => new Response(`Hello User ${req.params.id}!`),

    // Per-method handlers
    '/api/posts': {
      GET: () => new Response('List posts'),
      POST: async (req) => {
        const body = await req.json();
        return Response.json({ created: true, ...body });
      },
    },

    // Wildcard
    '/api/*': Response.json({ message: 'Not found' }, { status: 404 }),

    // Redirect
    '/blog/hello': Response.redirect('/blog/hello/world'),

    // Serve file
    '/favicon.ico': Bun.file('./favicon.ico'),
  },

  // Fallback for unmatched routes
  fetch(req) {
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running at ${server.url}`);
```

## Export Default Syntax

```typescript
import type { Serve } from 'bun';

export default {
  fetch(req) {
    return new Response('Bun!');
  },
} satisfies Serve.Options<undefined>;
```

The `<undefined>` type parameter represents WebSocket data. Replace with your data type if using `server.upgrade(req, { data: ... })`.

## Configuration

### Port and Hostname

```typescript
Bun.serve({
  port: 8080, // defaults to $BUN_PORT, $PORT, $NODE_PORT, or 3000
  hostname: '0.0.0.0', // defaults to "0.0.0.0"
  fetch(req) {
    return new Response('OK');
  },
});
```

Random port: set `port: 0`, then read `server.port`.

### Default Port Options

- CLI: `bun --port=4002 server.ts`
- Environment: `BUN_PORT`, `PORT`, or `NODE_PORT`

### Unix Domain Sockets

```typescript
Bun.serve({
  unix: '/tmp/my-socket.sock',
  fetch(req) {
    return new Response('OK');
  },
});
```

Abstract namespace (Linux): prefix with null byte `"\0my-abstract-socket"`.

### Idle Timeout

```typescript
Bun.serve({
  idleTimeout: 10, // seconds
  fetch(req) {
    return new Response('OK');
  },
});
```

## HTML Imports

Import HTML files directly for full-stack apps:

```typescript
import myReactApp from './index.html';

Bun.serve({
  routes: {
    '/': myReactApp,
  },
});
```

- **Development (`bun --hot`)**: Assets bundled on-demand with HMR
- **Production (`bun build --target=bun`)**: Pre-built manifest for zero runtime bundling

## Server Lifecycle

### stop()

```typescript
await server.stop(); // Graceful - waits for in-flight requests
await server.stop(true); // Force - closes all connections immediately
```

### reload()

Update handlers without restart:

```typescript
server.reload({
  routes: {
    '/api/version': Response.json({ version: 'v2' }),
  },
  fetch(req) {
    return new Response('v2');
  },
});
```

Only `fetch`, `error`, and `routes` can be updated.

### ref() / unref()

```typescript
server.unref(); // Allow process to exit if server is only thing running
server.ref(); // Keep process alive (default)
```

## Per-Request Controls

### Custom Timeout

```typescript
Bun.serve({
  async fetch(req, server) {
    server.timeout(req, 60); // 60 seconds for this request
    await req.text();
    return new Response('Done!');
  },
});
```

Pass `0` to disable timeout.

### Client IP

```typescript
const address = server.requestIP(req);
// { address: "127.0.0.1", port: 54321 } or null
```

## Server Metrics

```typescript
server.pendingRequests; // In-flight HTTP requests
server.pendingWebSockets; // Active WebSocket connections
server.subscriberCount('chat'); // Subscribers to WebSocket topic
```

## WebSocket Handler

```typescript
Bun.serve({
  fetch(req, server) {
    if (server.upgrade(req, { data: { userId: '123' } })) {
      return; // Upgraded
    }
    return new Response('Not a WebSocket request', { status: 400 });
  },
  websocket: {
    open(ws) {
      ws.subscribe('chat');
    },
    message(ws, message) {
      ws.publish('chat', message);
    },
    close(ws) {
      ws.unsubscribe('chat');
    },
  },
});
```

### WebSocket Options

| Option                     | Description                        |
| -------------------------- | ---------------------------------- |
| `maxPayloadLength`         | Maximum message size in bytes      |
| `backpressureLimit`        | Bytes before applying backpressure |
| `closeOnBackpressureLimit` | Close connection when limit hit    |
| `idleTimeout`              | Seconds before idle timeout        |
| `perMessageDeflate`        | Enable compression                 |
| `sendPings`                | Send ping frames                   |
| `publishToSelf`            | Receive own published messages     |

## TLS Configuration

```typescript
Bun.serve({
  tls: {
    cert: Bun.file('./cert.pem'),
    key: Bun.file('./key.pem'),
    ca: Bun.file('./ca.pem'), // Optional CA chain
    passphrase: 'secret', // Optional key passphrase
  },
  fetch(req) {
    return new Response('Secure!');
  },
});
```

## Error Handler

```typescript
Bun.serve({
  fetch(req) {
    throw new Error('Something went wrong');
  },
  error(error) {
    console.error(error);
    return new Response('Internal Server Error', { status: 500 });
  },
});
```

## Server Properties

| Property             | Description                 |
| -------------------- | --------------------------- |
| `server.url`         | Full URL including protocol |
| `server.port`        | Listening port              |
| `server.hostname`    | Bound hostname              |
| `server.development` | Development mode flag       |
| `server.id`          | Server instance ID          |

## REST API Example

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('posts.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL
  )
`);

Bun.serve({
  routes: {
    '/api/posts': {
      GET: () => Response.json(db.query('SELECT * FROM posts').all()),
      POST: async (req) => {
        const { title, content } = await req.json();
        const id = crypto.randomUUID();
        db.query('INSERT INTO posts (id, title, content) VALUES (?, ?, ?)').run(id, title, content);
        return Response.json({ id, title, content }, { status: 201 });
      },
    },
    '/api/posts/:id': (req) => {
      const post = db.query('SELECT * FROM posts WHERE id = ?').get(req.params.id);
      return post ? Response.json(post) : new Response('Not Found', { status: 404 });
    },
  },
});
```
