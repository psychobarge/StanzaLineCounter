# Contributing to StanzaLineCounter

Thanks for contributing.

## Prerequisites

- Node.js 22+
- npm 10+
- VS Code (or compatible editor: Cursor, Windsurf, Trae)

## Local Setup

1. Clone the repository.
2. Install dependencies:
    - `npm install`
3. Build once:
    - `npm run compile`
4. Open the project in VS Code and press `F5` to run the extension in an Extension Development Host.

## Useful Commands

- `npm run format` - format all files
- `npm run format:check` - check formatting
- `npm run typecheck` - run TypeScript type checking
- `npm run lint` - run ESLint on source files
- `npm test` - run test suite
- `npm run test:coverage` - run tests with coverage
- `npm run compile` - build extension bundle with esbuild
- `npm run watch` - watch mode build with esbuild

## Commit Convention

Use Conventional Commits:

- `feat:` new behavior
- `fix:` bug fix
- `refactor:` internal refactor without behavior changes
- `test:` test additions/changes
- `docs:` documentation changes
- `ci:` CI workflow changes
- `chore:` tooling/maintenance changes

Examples:

- `feat: add extension-specific line limits`
- `fix: refresh folder badges after config change`

## Pull Request Process

Before opening a PR:

1. Run `npm run format:check`
2. Run `npm run typecheck`
3. Run `npm run lint`
4. Run `npm test`
5. Update documentation if behavior changed (`README.md`, `CHANGELOG.md`)

PR checklist:

- Small and focused scope
- Clear title and description
- Linked issue (if applicable)
- Tests added/updated for behavior changes

## Project Structure

```
src/
├── extension.ts                    # Activation + VS Code wiring
├── lineCountDecorationProvider.ts  # Core decoration logic
├── utils.ts                        # Pure utility functions
├── extension.test.ts               # Extension command tests
└── utils.test.ts                   # Utility tests
```

## Releases

- CI builds and validates on pushes/PRs.
- Tag pushes trigger packaging and release workflow.
