# EduTrack — Codex Instructions

## Project

EduTrack is a responsive educational platform for secondary-school students in Cameroon.

Stack:

- Frontend: React, TypeScript, Vite, React Router Data Mode, TanStack Query, Tailwind CSS.
- Backend: Node.js, Fastify, TypeScript, PostgreSQL, Drizzle ORM.
- Contracts: Zod schemas and shared API types.
- Monorepo: npm workspaces (`frontend/`, `backend/`, `contracts/`).
- Development: Windows 11, VS Code, Git Bash.

## Operating Modes

### Manual Mode (DEFAULT)

- Read-only inspection is allowed. Inspect the repository and execute read-only commands (e.g., `pwd`, `ls`, `find`, `cat`, `git status`, `rg`) to understand existing code and identify accurate file paths and line numbers.
- Do not create, modify, or delete files; install dependencies; execute implementation commands; or change repository state in Manual Mode.
- Provide all implementation, installation, and verification commands for the user to execute manually.
- Inspect relevant existing files before proposing changes.
- Provide numbered, step-by-step implementation instructions.
- Include complete code snippets and exact file paths.
- For edits, specify precisely what to insert, replace, or remove.
- Provide clickable file references with verified line numbers when supported.
- Include Git Bash commands to create files/directories when needed.
- Provide test commands, expected results, and manual verification steps.
- Do not claim tests passed unless they were actually executed.

### Implementation Mode

- Activate only when explicitly requested.
- Implement only the authorized task.
- Create or modify necessary files and run relevant tests.
- Report changed files, actual test results, and remaining issues.
- Provide exact commands for independent verification.

## Architecture

- Follow a domain-oriented modular monolith.
- Keep business logic, authorization, and Drizzle schemas in `backend/`.
- Keep React UI, routing, and TanStack Query in `frontend/`.
- Define shared API contracts once in `contracts/`.
- Never duplicate contracts or import backend code into the frontend.
- Enforce authentication, permissions, and resource ownership server-side.
- Preserve Course versions, historical learning records, and Quiz attempt integrity.

## Development Workflow

1. Work on one approved increment at a time (M0–M9).
2. Review requirements and relevant existing code.
3. Follow: contracts → backend → backend tests → frontend → acceptance tests.
4. Keep changes focused; avoid unrelated refactoring or dependencies.
5. Add meaningful tests and report actual results.
6. Document nonobvious logic, business rules, and security decisions.
7. Follow existing naming, structure, and formatting conventions.
8. Keep responses concise except for required implementation details.

## Git and Safety

- Never commit, push, deploy, or run destructive operations without explicit authorization.
- Never expose secrets or credentials.
- Use Conventional Commits when commit messages are requested:
  `type(scope): description`.
- Ask before introducing major architectural changes.
