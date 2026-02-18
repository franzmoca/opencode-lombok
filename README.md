# opencode-lombok

`opencode-lombok` is an OpenCode plugin that adds Lombok support to Java projects.

This plugin was inspired by [opencode PR #8031](https://github.com/anomalyco/opencode/pull/8031).

It automatically:

- detects Lombok usage in `pom.xml`, `build.gradle`, and `build.gradle.kts`
- downloads `lombok.jar` when needed
- configures `JAVA_TOOL_OPTIONS` with `-javaagent:<path-to-lombok.jar>` so JVM-based LSP servers (including JDTLS) pick it up

If `JAVA_TOOL_OPTIONS` already exists, the plugin appends the Lombok javaagent and avoids duplicates.

## Install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@franzmoca/opencode-lombok"]
}
```

You can also pin a specific version:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@franzmoca/opencode-lombok@0.1.0"]
}
```

OpenCode will install npm plugins automatically at startup.

## Behavior

- If `lsp` is globally disabled (`"lsp": false`), the plugin does nothing.
- If `jdtls` is explicitly disabled (`"lsp": { "jdtls": { "disabled": true } }`), the plugin does nothing.
- If `OPENCODE_DISABLE_LSP_DOWNLOAD=true`, the plugin will not download `lombok.jar`.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Publish to npm

```bash
npm login
npm publish --access public
```

Or use the GitHub Actions workflow:

- `CI` runs typecheck, tests, and build on push/PR.
- `Publish` runs on tags (`v*`) and publishes with `NPM_TOKEN`.

### Required GitHub secret

- `NPM_TOKEN`: npm automation token with publish rights for `@franzmoca/opencode-lombok`

## License

MIT
