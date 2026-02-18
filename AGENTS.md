# AGENTS.md

## Project Overview

`opencode-lombok` is a single-package TypeScript library implementing an [OpenCode](https://opencode.ai) plugin that auto-detects Lombok in Java projects and configures the JDT-LS language server accordingly.

- **Runtime / package manager:** Bun (>= 1.3.0)
- **Language:** TypeScript (strict)
- **Source:** `src/` — `core.ts` (pure logic), `index.ts` (plugin entry point)
- **Tests:** `test/core.test.ts` — Bun's built-in test runner
- **Output:** `dist/` (compiled via `tsc`)

---

## Commands

### Install

```bash
bun install
```

### Build

```bash
bun run build        # compile TypeScript → dist/
bun run typecheck    # type-check without emitting (CI gate)
```

### Test

```bash
bun test                                              # run all tests
bun test test/core.test.ts                            # run a single test file
bun test --test-name-pattern "hasLombokDependency"    # run tests matching a name
bun test --test-name-pattern "mergeJavaToolOptions"   # run a specific describe block
```

### Pre-publish gate (runs typecheck + test + build)

```bash
bun run prepublishOnly
```

There is no lint or format script. No ESLint, Prettier, or Biome is configured.

---

## TypeScript Configuration

Key `tsconfig.json` settings:

| Option | Value | Implication |
|---|---|---|
| `strict` | `true` | All strict checks enabled — no implicit `any`, strict null checks, etc. |
| `module` | `NodeNext` | Requires explicit `.js` extensions on relative imports in source files |
| `moduleResolution` | `NodeNext` | Same as above |
| `verbatimModuleSyntax` | `true` | `import type` is **required** for type-only imports |
| `target` | `ES2022` | Modern JS output |
| `declaration` | `true` | Generates `.d.ts` files |

The `test/` directory is **not** included in `tsconfig.json`; Bun runs tests directly without `tsc`.

---

## Code Style

### Imports

- Use **named imports** for everything except Node built-in namespace objects.
- Use **default imports** only for Node built-ins: `import fs from "fs/promises"`, `import os from "os"`, `import path from "path"`.
- Always use **`import type`** for type-only imports (enforced by `verbatimModuleSyntax`):
  ```ts
  import type { Dirent } from "fs"
  import type { Plugin, PluginInput } from "@opencode-ai/plugin"
  ```
- Relative imports **must** use the `.js` extension (required by `moduleResolution: NodeNext`):
  ```ts
  import { detectLombokDependency } from "./core.js"
  ```
- No path aliases — use relative paths or bare package specifiers only.
- Re-export with `export * from "./core.js"` style barrel exports.

### Naming Conventions

| Kind | Convention | Example |
|---|---|---|
| Source files | `kebab-case` | `core.ts`, `index.ts` |
| Test files | Mirror source + `.test.ts` | `core.test.ts` |
| Exported functions | `camelCase`, verb-noun | `detectLombokDependency`, `ensureLombokJar` |
| Internal helpers | `camelCase` | `pathExists`, `readEntries`, `readText` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `LOMBOK_URL`, `BUILD_FILES`, `SKIP_DIRS` |
| Local variables / params | `camelCase` | `jarPath`, `projectDir` |
| Type aliases | `PascalCase` | `Level`, `Plugin`, `PluginInput` |
| Exported plugin instance | `PascalCase` | `LombokPlugin` |

### Formatting

No formatter is enforced. Follow the style visible in existing source files:

- 2-space indentation
- Single quotes for strings
- Trailing semicolons
- Arrow functions preferred over `function` declarations for small helpers
- Keep functions small and pure where possible

### Types

- `strict: true` must always pass — no `any`, no implicit type widening.
- Prefer explicit return types on exported functions.
- Use `undefined` as a sentinel for "not found / failed" (not `null`).
- Avoid enums — use string literal union types instead.

---

## Error Handling

The codebase uses a **silent-failure / return-undefined** pattern throughout. There are no `try/catch` blocks; all error handling is done via promise chaining:

```ts
// Filesystem helpers return safe defaults on failure
const pathExists = async (file: string) =>
  fs.stat(file).then(() => true).catch(() => false)

const readEntries = async (dir: string): Promise<Dirent[]> =>
  fs.readdir(dir, { withFileTypes: true }).catch(() => [])

const readText = async (file: string) =>
  fs.readFile(file, "utf8").catch(() => "")

// Network calls return undefined on failure; callers check before proceeding
const response = await fetch(LOMBOK_URL).catch(() => undefined)
if (!response?.ok) return undefined
```

- Functions that can fail return `undefined` (not thrown errors).
- Callers use optional chaining (`?.`) or explicit `undefined` checks.
- Fire-and-forget side effects (e.g., logging) use `.catch(() => {})`.
- The plugin layer logs `warn` messages via the OpenCode SDK rather than propagating errors upward.

---

## Testing Patterns

- **Framework:** `bun:test` — `import { describe, expect, test } from "bun:test"`
- **Structure:** One `describe` block per public function, `test` descriptions are plain English.
- **Assertions:** `expect(...).toBe(...)` for simple equality; no `toEqual`/`toMatchObject` unless needed.
- **Async tests:** `test("...", async () => { ... })` for any I/O.
- **Temp directory helper:** Use a `withTemp` helper that creates a temp dir, runs the callback, and always cleans up in `finally`:
  ```ts
  const withTemp = async (fn: (dir: string) => Promise<void>) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"))
    try { await fn(dir) }
    finally { await fs.rm(dir, { recursive: true, force: true }) }
  }
  ```
- **No mocking:** The architecture avoids mocking by using dependency injection — functions that read from the environment accept explicit arguments (e.g., `opencodeDataDir(platform, env, home)` instead of reading `process.env` directly).
- **Test file location:** `test/` at project root — not colocated with source files.

---

## Architecture Notes

- `src/core.ts` — all pure business logic: Lombok detection, JAR management, env var merging. No plugin SDK imports.
- `src/index.ts` — thin plugin entry point that wires `core.ts` into the OpenCode plugin lifecycle. Imports `Plugin` and `PluginInput` from `@opencode-ai/plugin`.
- Keep `core.ts` free of framework dependencies so its logic remains independently testable.
- The plugin exports a single named `const`: `export const LombokPlugin: Plugin = async (input) => ({ ... })`.

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

1. `bun install --frozen-lockfile`
2. `bun run typecheck`
3. `bun test`
4. `bun run build`

All four steps must pass before merging.
