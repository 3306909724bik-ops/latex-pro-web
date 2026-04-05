# latex-pro-web

A V2 academic report workbench for structured LaTeX drafting, workspace-based document editing, and PDF preview compilation.

## What it does

- Multi-workspace report drafting
- Requirement / Results / Reference upload buckets
- Section-based editing with structured blocks
- Editable tables, charts, and figures
- PDF preview compilation
- Public demo / locked full-AI mode architecture
- Minimal backend proxy for access-code-gated AI usage

## Core stack

- React
- TypeScript
- Zustand
- Tailwind CSS
- Vite
- Node.js minimal backend proxy

## Public demo note

This project is designed to support a **public demo mode** and a **full-featured locked mode**.

In public/demo usage:
- UI and non-sensitive flows can be shown publicly
- Full AI functionality should be gated behind an access code
- OpenAI keys should remain server-side only

## Local development

### Frontend

```bash
npm install
npm run dev
```

### Minimal backend

```bash
cp .env.server.example .env.server
npm run server
```

Then configure these values in your shell or deployment environment:

- `DEMO_ACCESS_CODE`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional)
- `OPENAI_MODEL` (optional)
- `ALLOWED_ORIGIN`
- `RATE_LIMIT_MAX_REQUESTS`

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run server
```

## Suggested repo hygiene before publishing

- Do **not** commit `.env.local`, `.env.server`, or any secret-bearing files
- Do **not** commit private data samples or user documents
- Add screenshots / GIFs before sharing publicly
- Prefer a public demo with gated AI rather than exposing paid API usage directly
- See `PUBLISHING_CHECKLIST.md` for a step-by-step public release checklist

## Current direction

This repository reflects the V2 rebuild direction:
- single-source-of-truth state with Zustand
- desktop-first 3-column workbench
- workspace management
- structured report editing
- safer public-demo architecture
