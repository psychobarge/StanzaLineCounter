# AGENTS.md

## Cursor Cloud specific instructions

This is a **VS Code extension** (TypeScript). There are no backend services, databases, or Docker dependencies. The extension runs inside a VS Code Extension Development Host at runtime, so end-to-end GUI testing requires an IDE.

### Quick reference

| Action | Command |
|---|---|
| Install deps | `npm install --legacy-peer-deps` |
| Lint | `npm run lint` |
| Test | `npm test` |
| Test (watch) | `npm run test:watch` |
| Coverage | `npm run test:coverage` |
| Compile | `npm run compile` |
| Watch mode | `npm run watch` |

### Notes

- Node 22 is used in CI (`.github/workflows/tests.yml`). The project uses `npm` (lockfile: `package-lock.json`).
- `--legacy-peer-deps` flag is used in CI for `npm install`; use the same locally.
- Unit tests use **Vitest** and cover `src/utils.ts`. The main extension files (`extension.ts`, `lineCountDecorationProvider.ts`) depend on the `vscode` API and are not unit-testable without the Extension Development Host.
- ESLint config is in `eslint.config.mjs` (flat config format with `typescript-eslint`).
- Compilation output goes to `out/`; this directory is gitignored.
