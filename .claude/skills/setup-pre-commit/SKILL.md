---
name: setup-pre-commit
description: Set up Husky pre-commit hooks with lint-staged (oxfmt + oxlint), type checking, and tests in this repo. Use when user wants to add pre-commit hooks, set up Husky, configure lint-staged, or add commit-time formatting/linting/typechecking/testing.
---

# Setup Pre-Commit Hooks

This repo (`@smonn/ids`) uses **pnpm**, **oxfmt** for formatting, **oxlint** for
linting, **tsc** for type checking, and **vitest** for tests. There is no
Prettier/ESLint — do not introduce them.

## What This Sets Up

- **Husky** pre-commit hook
- **lint-staged** running `oxfmt` then `oxlint --fix` on staged JS/TS files
- **typecheck** (`tsc --noEmit`) and **test** (`vitest run`) in the pre-commit hook

The relevant scripts already exist in `package.json`: `fmt` (oxfmt), `lint`
(oxlint), `typecheck`, `test`.

## Steps

### 1. Package manager

This repo uses **pnpm** (`pnpm-lock.yaml`, `packageManager: pnpm@...`). Use
`pnpm` for all commands.

### 2. Install dependencies

Install as devDependencies (oxfmt/oxlint are already present):

```
pnpm add -D husky lint-staged
```

### 3. Initialize Husky

```bash
pnpm exec husky init
```

This creates `.husky/` and adds `prepare: "husky"` to package.json. If the
generated `.husky/pre-commit` contains a default `pnpm test` line, overwrite it
in the next step.

### 4. Create `.husky/pre-commit`

Write this file (no shebang needed for Husky v9+):

```
pnpm exec lint-staged
pnpm run typecheck
pnpm run test
```

`lint-staged` runs first (fast, staged-only formatting + lint autofix), then the
full `typecheck` and `test` suites run against the whole project.

### 5. Create `.lintstagedrc.json`

`oxfmt` and `oxlint` both accept file paths, so lint-staged can pass the staged
filenames straight through:

```json
{
  "*.{ts,mts,cts,tsx,js,mjs,cjs,jsx}": ["oxfmt", "oxlint --fix"]
}
```

Order matters: format first, then lint-fix.

### 6. Formatter config

No action needed. Formatting is owned by **oxfmt** (`.oxfmtrc.json`) and linting
by **oxlint** (`.oxlintrc.json`), both already committed. Do **not** add a
Prettier or ESLint config.

### 7. Verify

- [ ] `.husky/pre-commit` exists
- [ ] `.lintstagedrc.json` exists
- [ ] `prepare` script in package.json is `"husky"`
- [ ] `husky` and `lint-staged` are in devDependencies
- [ ] Run `pnpm exec lint-staged` (with something staged) to verify it works

### 8. Commit

Stage all changed/created files and commit with message:
`Add pre-commit hooks (husky + lint-staged + oxfmt/oxlint)`

Consider whether a changeset is needed — tooling-only changes usually don't
warrant one (see `CONTRIBUTING.md`). This commit will run through the new
pre-commit hooks: a good smoke test that everything works.

## Notes

- Husky v9+ doesn't need shebangs in hook files.
- `oxfmt` formats in place by default (the `fmt:check` script uses `--check` for
  CI; the hook wants the in-place form).
- The pre-commit runs lint-staged first (fast, staged-only), then full typecheck
  and tests. If the test suite ever grows slow enough to make commits painful,
  drop `pnpm run test` from the hook and rely on CI instead.
