# Ekusupo

Universal music and video experience built as a TypeScript pnpm monorepo.

## Local development

Install dependencies:

```bash
pnpm install
pnpm approve-builds --all
```

Start the API and web app in separate terminals:

```bash
pnpm --filter @ekusupo/api run dev
pnpm --filter @ekusupo/web run dev
```

Then open http://127.0.0.1:5174.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

## Optional provider configuration

Copy `.env.example` to `.env` and configure provider credentials. The app runs in demo mode without them.
EOF
