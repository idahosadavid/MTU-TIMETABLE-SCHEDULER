# MTU Timetable Scheduler

Full-stack timetable scheduling app with:

- React + Vite client in `client/`
- Express server in `server/`

## Prerequisites

- Node.js 18+
- npm

## Setup

From the repository root:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

## Run in development

From the repository root:

```bash
npm run dev
```

This starts both server and client concurrently.

## Production mode

```bash
npm run prod
```

## Contributor guidelines

- Do not commit generated files or folders such as `node_modules/`, `dist/`, and log files.
- Keep secrets in `.env` files (already ignored) and never commit credentials.
- If dependencies are missing, reinstall locally using npm commands instead of committing package contents.
