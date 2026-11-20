# EduTrack

EduTrack is a responsive educational platform for secondary-school students in Cameroon.

## Repository layout

- `frontend/` — React application workspace
- `backend/` — Node.js API workspace
- `contracts/` — shared API contracts workspace

## Getting started

This repository is initialized as an npm workspace monorepo. Application frameworks and dependencies will be added in later project increments.

## Backend database schemas

- Keep Drizzle definitions in `backend/src/infrastructure/database/schema/`, organized by domain.
- Create a domain directory only when adding its first real `*.table.ts` file.
- Add `relations.ts` within a domain only when that domain has Drizzle relations.
- Export actual table and relation modules through the central `schema/index.ts`, which Drizzle Kit uses as its schema entry point.
- Domain modules should import their related tables directly rather than through `schema/index.ts`.
- Generated migrations and metadata belong in `backend/drizzle/` and should be committed with the migration SQL.

## Commands

- `npm test` — run available workspace tests
- `npm run lint` — lint repository JavaScript and TypeScript
- `npm run typecheck` — typecheck workspaces with TypeScript inputs
- `npm run format` — format supported repository files
- `npm run format:check` — check formatting without changing files
- `npm run check:workspaces` — verify npm workspace links
