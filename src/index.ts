import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  detectLombokDependency,
  ensureLombokJar,
  isLspDownloadDisabled,
  lombokJarPath,
  mergeJavaToolOptions,
} from "./core.js";

const SERVICE = "plugin.lombok";

type Level = "debug" | "info" | "warn" | "error";

function jdtlsDisabled(lsp: unknown) {
  if (!lsp || typeof lsp !== "object") return false;
  if (!("jdtls" in lsp)) return false;
  const jdtls = (lsp as Record<string, unknown>).jdtls;
  if (!jdtls || typeof jdtls !== "object") return false;
  return Boolean((jdtls as { disabled?: boolean }).disabled);
}

async function log(
  ctx: PluginInput,
  level: Level,
  message: string,
  extra?: Record<string, unknown>,
) {
  await ctx.client.app
    .log({
      body: {
        service: SERVICE,
        level,
        message,
        extra,
      },
    })
    .catch(() => {});
}

export const LombokPlugin: Plugin = async (ctx) => {
  return {
    config: async (config) => {
      if (config.lsp === false) return;
      if (jdtlsDisabled(config.lsp)) return;

      const lombokDetected = await detectLombokDependency(ctx.directory);
      if (!lombokDetected) return;

      await log(ctx, "info", "Lombok dependency detected");
      const jar = await ensureLombokJar(lombokJarPath());
      if (!jar) {
        await log(
          ctx,
          "warn",
          "Lombok detected but lombok.jar is unavailable",
          {
            downloadDisabled: isLspDownloadDisabled(),
          },
        );
        return;
      }

      const current = process.env.JAVA_TOOL_OPTIONS;
      const existing = typeof current === "string" ? current.trim() : "";
      const next = mergeJavaToolOptions(current, jar);
      process.env.JAVA_TOOL_OPTIONS = next;

      if (next === existing) {
        await log(
          ctx,
          "info",
          "JAVA_TOOL_OPTIONS already has a Lombok javaagent",
          { jarPath: jar },
        );
        return;
      }

      await log(
        ctx,
        "info",
        "Configured Lombok javaagent for JVM-based language servers",
        {
          jarPath: jar,
        },
      );
    },
  };
};

export default LombokPlugin;
export * from "./core.js";
