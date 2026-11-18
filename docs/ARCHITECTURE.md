# Ekusupo Architecture

Ekusupo is a universal music and video platform built as a TypeScript pnpm monorepo.

## Layers

- `apps/web`: user-facing web application.
- `apps/api`: public API service.
- `packages/*`: shared packages and provider integrations.
- `services/*`: infrastructure and integration services.

## Principles

- Keep provider integrations isolated.
- Keep playback policy explicit.
- Keep secrets server-side.
- Keep UI pixel-art constraints documented.
