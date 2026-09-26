# Repository Guidelines

## Project Structure & Module Organization

FastAPI/React/SQLite application with a browser extension. See the [development guide](docs/开发指导.md) for setup, scenarios, and troubleshooting.

- `app/`: API, validation, SQLite, migrations, and archives.
- `src/web/`: components, state, translations, CSS/HTML.
- `src/extension/`, `src/adapters/`: browser integration and Jira/Mattermost readers.
- `src/contracts/`, `src/generated/`, `contracts/`: messaging and API definitions.
- `dummy/`, `src/dummy/`, `src/probe/`: simulated services and probes.
- `tests/{backend,frontend,e2e}/`, `tests/fixtures/`: tests and fixtures.
- `tools/`, `scripts/`, `docs/`: tooling and guides; `dist/`: generated builds.

## Build, Test, and Development Commands

Run commands from the repository root. Hosts are for inspection/editing; execute project commands through `bash .agent/run.sh`. Never invoke `docker run` directly. Report Docker failures without host fallback. Start services directly through the runner for port mapping; reserve `sh -c` for non-serving compound commands.

| Command | Purpose |
| --- | --- |
| `bash .agent/run.sh python -m pip install --require-hashes -r requirements/dev.txt` | Bootstrap a fresh Python volume. |
| `bash .agent/run.sh python -m tools.sync_deps` | Synchronize dependency locks. |
| `bash .agent/run.sh npm run build` | Build development assets before serving/testing. |
| `bash .agent/run.sh python -m tools.dev` | Serve `http://board.localhost:4173`; no hot reload. |
| `bash .agent/run.sh npm run check` | Check types, contracts, syntax, boundaries. |
| `bash .agent/run.sh python -m pytest tests/backend -q` | Run backend tests. |
| `bash .agent/run.sh npm run test:unit` | Run Vitest tests. |
| `bash .agent/run.sh npm run test:e2e` | Run Playwright tests. |

## Coding Style & Naming Conventions

Python: four-space indentation, snake_case. Match surrounding TypeScript formatting; use PascalCase components and camelCase functions. Strict TypeScript; no configured formatter/linter. After API changes, run `bash .agent/run.sh npm run generate:api`; commit both outputs without manual edits.

## Testing Guidelines

Use pytest `test_*.py`, Vitest `*.test.ts`, and Playwright `*.spec.ts`. Before E2E: `bash .agent/run.sh npm exec -- playwright install chromium`. Add regression coverage; no coverage threshold exists. Follow the development guide's scenarios and production-bundle caveats. CI does not run these suites.

## Commit & Pull Request Guidelines

Prefer `feat:`, `fix:`, `test:`, `docs:`, and `refactor(i18n):` prefixes found in history. Describe behavior changes, link issues, record checks/unverified scenarios, and include UI screenshots. Review staged changes; exclude unrelated work.

## Security & Configuration

Keep credentials and personal previews out of shared storage/logs; the backend must not fetch Jira/Mattermost content. Use ignored `config/*.local.json`; never commit databases or backups. Commit dependency locks with manifest changes. Keep runtime pins aligned across version files, runner, and Dockerfiles.
