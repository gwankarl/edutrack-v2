# EduTrack

EduTrack is a responsive educational platform for secondary-school students in Cameroon.

## Repository layout

- `frontend/` — React application workspace
- `backend/` — Node.js API workspace
- `contracts/` — shared API contracts workspace

## Requirements

- Node.js 24 (the same major version used by GitHub Actions)
- npm bundled with Node.js
- PostgreSQL 16 only when running database integration tests

## Getting started

From the repository root, install the locked workspace dependencies:

```bash
npm ci
```

Run the local quality, build, and non-database test checks:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build --workspace=@edutrack/contracts
npm run test:unit
npm run build --workspace=@edutrack/frontend
npm run check:workspaces
```

Build contracts before the frontend because `@edutrack/contracts` exports its runtime entry point from `contracts/dist`.

## Environment setup

Copy the examples before starting local applications:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Replace placeholders in the ignored `.env` files with local values. Frontend variables prefixed with `VITE_` are exposed to browser code; never place secrets in them.

## PostgreSQL integration tests

Database integration tests require PostgreSQL 16 and a dedicated `edutrack_test` database. Configure `DATABASE_TEST_URL` in the ignored `backend/.env` to use that database on a loopback host. The test guard rejects other database names, non-loopback hosts, and a target matching `DATABASE_URL`.

Run database tests separately from unit tests:

```bash
npm run test:db
```

Do not point `DATABASE_TEST_URL` at development or production databases. These tests issue read-only connectivity queries; they do not run migrations or seed data. `npm run test:all` runs unit tests followed by database integration tests and therefore requires the dedicated test database.

## Backend database schemas

- Keep Drizzle definitions in `backend/src/infrastructure/database/schema/`, organized by domain.
- Create a domain directory only when adding its first real `*.table.ts` file.
- Add `relations.ts` within a domain only when that domain has Drizzle relations.
- Export actual table and relation modules through the central `schema/index.ts`, which Drizzle Kit uses as its schema entry point.
- Domain modules should import their related tables directly rather than through `schema/index.ts`.
- Generated migrations and metadata belong in `backend/drizzle/` and should be committed with the migration SQL.

## Useful commands

- `npm run test:unit` — frontend, backend, and contracts unit/component/API tests
- `npm run test:db` — PostgreSQL integration tests against `edutrack_test`
- `npm run lint` — lint JavaScript and TypeScript
- `npm run typecheck` — typecheck workspaces with TypeScript inputs
- `npm run format:check` — check formatting without changing files
- `npm run check:workspaces` — verify npm workspace links
