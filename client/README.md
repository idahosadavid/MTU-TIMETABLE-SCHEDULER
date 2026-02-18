# MTU Timetable Scheduler

This repository contains a React client (`client/`) and an Express server (`server/`) orchestrated from the workspace root.

## Setup

From the repository root:

1. Install root tools:

	```bash
	npm install
	```

2. Install client dependencies:

	```bash
	npm install --prefix client
	```

3. Install server dependencies:

	```bash
	npm install --prefix server
	```

## Run locally

Start client and server together from the repository root:

```bash
npm run dev
```

## Contributor notes

- Do not commit generated artifacts such as `node_modules/`, `dist/`, or logs.
- The repo root `.gitignore` already excludes these paths.
- If dependencies are missing locally, reinstall with `npm install` commands instead of committing package contents.
