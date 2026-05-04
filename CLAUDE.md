# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

UIGen is an AI-powered React component generator with live preview. Users describe components in a chat interface, and the AI generates React code that renders in a sandboxed iframe preview. Files exist only in a virtual file system (nothing written to disk).

## Commands

- `npm run setup` — install deps, generate Prisma client, run migrations
- `npm run dev` — start dev server (Next.js + Turbopack) on port 3000
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run test` — run all tests (vitest)
- `npx vitest run src/path/to/test.test.ts` — run a single test file
- `npx prisma migrate dev` — apply database migrations
- `npx prisma generate` — regenerate Prisma client after schema changes
- `npm run db:reset` — reset database (destructive)

## Architecture

### Request Flow

1. User sends a chat message from the client (`ChatProvider` → `/api/chat`)
2. The API route (`src/app/api/chat/route.ts`) attaches a system prompt and streams responses via Vercel AI SDK's `streamText`
3. The AI model uses two tools to manipulate files: `str_replace_editor` (create/edit files) and `file_manager` (rename/delete)
4. Tool calls stream back to the client where `FileSystemContext` applies them to the in-memory `VirtualFileSystem`
5. `PreviewFrame` watches for file changes, transforms JSX via `@babel/standalone`, builds an import map with blob URLs, and renders in a sandboxed iframe

### Key Abstractions

- **VirtualFileSystem** (`src/lib/file-system.ts`): In-memory tree of `FileNode`s. Supports create, read, update, delete, rename, and text-editor operations (str_replace, insert). Serialized as JSON to send between client and server.
- **JSX Transformer** (`src/lib/transform/jsx-transformer.ts`): Client-side Babel transform that converts JSX/TSX to browser-executable JS. Creates blob URLs and an import map. Third-party imports resolve via `esm.sh`. CSS imports are extracted and injected as `<style>` tags.
- **Provider** (`src/lib/provider.ts`): Returns either the real Anthropic model (`claude-haiku-4-5`) or a `MockLanguageModel` if no API key is set. The mock returns canned components for development without an API key.

### Context Providers

The app uses two React contexts that wrap the main content:
- `FileSystemProvider` — owns the `VirtualFileSystem` instance and handles tool call side effects
- `ChatProvider` — wraps Vercel AI SDK's `useChat`, sends file system state with each request

### Auth & Persistence

- JWT-based auth using `jose` (not NextAuth). Sessions stored in httpOnly cookies.
- Middleware (`src/middleware.ts`) protects `/api/projects` and `/api/filesystem` routes.
- Anonymous users get the full experience without persistence. Authenticated users get projects saved to SQLite via Prisma.
- Project data (messages + file system state) stored as JSON strings in the `Project` model.

### Database

SQLite via Prisma. Schema at `prisma/schema.prisma`. Two models: `User` and `Project`. Prisma client outputs to `src/generated/prisma`. Always reference `prisma/schema.prisma` to understand the database structure.

### Testing

Vitest with jsdom environment and React Testing Library. Tests live in `__tests__` directories next to their source files. Path aliases (`@/`) work in tests via `vite-tsconfig-paths`.

## Code Style

- Use comments sparingly. Only comment complex code.

## Important Notes

- Do NOT run `npm audit fix` — dependencies are pinned to compatible versions.
- The app works without `ANTHROPIC_API_KEY` by falling back to the mock provider.
- Preview iframe uses `allow-scripts allow-same-origin allow-forms` sandbox flags (needed for blob URL import maps).
- The entry point for preview defaults to `/App.jsx` and falls back to other common names.
