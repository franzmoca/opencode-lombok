import { describe, expect, test } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  detectLombokDependency,
  ensureLombokJar,
  formatJavaAgentArg,
  hasLombokDependency,
  isLspDownloadDisabled,
  mergeJavaToolOptions,
  opencodeDataDir,
} from "../src/core";
import { pathToFileURL } from "url";

const withTemp = async (fn: (dir: string) => Promise<void>) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-lombok-test-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

describe("hasLombokDependency", () => {
  test("detects maven lombok artifact", () => {
    expect(hasLombokDependency("<artifactId>lombok</artifactId>")).toBe(true);
  });

  test("detects gradle lombok dependency", () => {
    expect(
      hasLombokDependency('implementation("org.projectlombok:lombok:1.18.40")'),
    ).toBe(true);
  });

  test("detects freefair lombok plugin", () => {
    expect(hasLombokDependency('id("io.freefair.lombok") version "8.6"')).toBe(
      true,
    );
  });
});

describe("detectLombokDependency", () => {
  test("finds lombok in root pom.xml", async () => {
    await withTemp(async (dir) => {
      await fs.writeFile(
        path.join(dir, "pom.xml"),
        "<artifactId>lombok</artifactId>",
      );
      expect(await detectLombokDependency(dir)).toBe(true);
    });
  });

  test("finds lombok in nested gradle project", async () => {
    await withTemp(async (dir) => {
      const nested = path.join(dir, "services", "api");
      await fs.mkdir(nested, { recursive: true });
      await fs.writeFile(
        path.join(nested, "build.gradle.kts"),
        'id("io.freefair.lombok") version "8.6"',
      );
      expect(await detectLombokDependency(dir)).toBe(true);
    });
  });

  test("skips node_modules while scanning", async () => {
    await withTemp(async (dir) => {
      const dep = path.join(dir, "node_modules", "dep");
      await fs.mkdir(dep, { recursive: true });
      await fs.writeFile(
        path.join(dep, "build.gradle"),
        "implementation 'org.projectlombok:lombok:1.18.38'",
      );
      expect(await detectLombokDependency(dir)).toBe(false);
    });
  });
});

describe("mergeJavaToolOptions", () => {
  test("adds javaagent when option is empty", () => {
    expect(mergeJavaToolOptions(undefined, "/tmp/lombok.jar")).toBe(
      "-javaagent:/tmp/lombok.jar",
    );
  });

  test("appends javaagent preserving existing options", () => {
    expect(mergeJavaToolOptions("-Xmx2g", "/tmp/lombok.jar")).toBe(
      "-Xmx2g -javaagent:/tmp/lombok.jar",
    );
  });

  test("does not add duplicate lombok javaagent", () => {
    expect(
      mergeJavaToolOptions(
        "-Xmx2g -javaagent:/cache/lombok.jar",
        "/tmp/lombok.jar",
      ),
    ).toBe("-Xmx2g -javaagent:/cache/lombok.jar");
  });
});

describe("formatJavaAgentArg", () => {
  test("quotes paths with spaces", () => {
    expect(formatJavaAgentArg("/tmp/java tools/lombok.jar")).toBe(
      '-javaagent:"/tmp/java tools/lombok.jar"',
    );
  });
});

describe("opencodeDataDir", () => {
  test("uses XDG_DATA_HOME on linux", () => {
    expect(
      opencodeDataDir("linux", { XDG_DATA_HOME: "/xdg" }, "/home/user"),
    ).toBe("/xdg/opencode");
  });

  test("builds default linux path", () => {
    expect(opencodeDataDir("linux", {}, "/home/user")).toBe(
      "/home/user/.local/share/opencode",
    );
  });

  test("builds default macOS path", () => {
    expect(opencodeDataDir("darwin", {}, "/Users/user")).toBe(
      "/Users/user/Library/Application Support/opencode",
    );
  });

  test("builds default windows path", () => {
    expect(opencodeDataDir("win32", {}, "C:\\Users\\user")).toBe(
      "C:\\Users\\user\\AppData\\Roaming\\opencode",
    );
  });

  test("ignores non-string env paths", () => {
    expect(
      opencodeDataDir(
        "linux",
        { XDG_DATA_HOME: {} as unknown as string },
        "/home/user",
      ),
    ).toBe("/home/user/.local/share/opencode");
  });
});

describe("isLspDownloadDisabled", () => {
  test("supports common truthy values", () => {
    expect(
      isLspDownloadDisabled({ OPENCODE_DISABLE_LSP_DOWNLOAD: "true" }),
    ).toBe(true);
    expect(isLspDownloadDisabled({ OPENCODE_DISABLE_LSP_DOWNLOAD: "1" })).toBe(
      true,
    );
    expect(
      isLspDownloadDisabled({ OPENCODE_DISABLE_LSP_DOWNLOAD: "yes" }),
    ).toBe(true);
  });

  test("returns false when unset", () => {
    expect(isLspDownloadDisabled({})).toBe(false);
  });
});

describe("ensureLombokJar", () => {
  test("returns undefined for non-path runtime values", async () => {
    expect(
      await ensureLombokJar({ path: "/tmp/lombok.jar" } as unknown as string),
    ).toBe(undefined);
  });

  test("accepts file URLs", async () => {
    await withTemp(async (dir) => {
      const jarPath = path.join(dir, "lombok.jar");
      await fs.writeFile(jarPath, "jar");
      expect(await ensureLombokJar(pathToFileURL(jarPath))).toBe(jarPath);
    });
  });
});
