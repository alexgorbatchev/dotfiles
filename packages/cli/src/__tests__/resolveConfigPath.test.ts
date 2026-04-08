import { NodeFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { ProcessInfo } from "../resolveConfigPath";
import { DEFAULT_CONFIG_FILES, resolveConfigPath } from "../resolveConfigPath";

const HOME_DIR = "/home/user";

function processInfo(cwd: string, homeDir: string = HOME_DIR): ProcessInfo {
  return { cwd, homeDir };
}

describe("resolveConfigPath", () => {
  let logger: TestLogger;
  let existsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logger = new TestLogger({ name: "test" });
    existsSpy = spyOn(NodeFileSystem.prototype, "exists");
  });

  afterEach(() => {
    existsSpy.mockRestore();
  });

  describe("with explicit config path", () => {
    it("expands ~/ in explicit config option using homeDir from processInfo", async () => {
      const result = await resolveConfigPath(logger, "~/config.ts", processInfo("/cwd", "/bootstrap-home"));

      expect(result).toBe("/bootstrap-home/config.ts");
    });

    it("resolves relative path to absolute", async () => {
      const result = await resolveConfigPath(logger, "my-config.ts", processInfo("/home/user/project"));

      expect(result).toBe("/home/user/project/my-config.ts");
    });

    it("returns absolute path as-is", async () => {
      const result = await resolveConfigPath(logger, "/absolute/path/config.ts", processInfo("/home/user/project"));

      expect(result).toBe("/absolute/path/config.ts");
    });

    it("does not check if file exists when explicit path provided", async () => {
      await resolveConfigPath(logger, "explicit.ts", processInfo("/home/user"));

      expect(existsSpy).not.toHaveBeenCalled();
    });

    it("logs resolved path", async () => {
      await resolveConfigPath(logger, "config.ts", processInfo("/home/user"));

      logger.expect(["DEBUG"], ["test", "resolveConfigPath"], [], ["Using configuration: /home/user/config.ts"]);
    });
  });

  describe("without explicit config path", () => {
    it("returns first existing default config file", async () => {
      existsSpy.mockImplementation(async (filePath: string) => {
        return filePath === "/project/dotfiles.config.ts";
      });

      const result = await resolveConfigPath(logger, "", processInfo("/project"));

      expect(result).toBe("/project/dotfiles.config.ts");
    });

    it("checks config files then boundary markers at each level", async () => {
      const checkedPaths: string[] = [];
      existsSpy.mockImplementation(async (filePath: string) => {
        checkedPaths.push(filePath);
        return false;
      });

      await resolveConfigPath(logger, "", processInfo("/project", "/"));

      expect(checkedPaths).toEqual([
        "/project/dotfiles.config.ts",
        "/project/project.json",
        "/project/.git",
        "/dotfiles.config.ts",
      ]);
    });

    it("returns undefined when no default config files exist", async () => {
      existsSpy.mockResolvedValue(false);

      const result = await resolveConfigPath(logger, "", processInfo("/project"));

      expect(result).toBeUndefined();
    });

    it("logs resolved path when config found", async () => {
      existsSpy.mockImplementation(async (filePath: string) => {
        return filePath === "/project/dotfiles.config.ts";
      });

      await resolveConfigPath(logger, "", processInfo("/project"));

      logger.expect(["DEBUG"], ["test", "resolveConfigPath"], [], ["Using configuration: /project/dotfiles.config.ts"]);
    });

    describe("directory walk-up", () => {
      it("finds config in parent directory when not in cwd", async () => {
        existsSpy.mockImplementation(async (filePath: string) => {
          return filePath === "/home/user/project/dotfiles.config.ts";
        });

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project/subdir"));

        expect(result).toBe("/home/user/project/dotfiles.config.ts");
      });

      it("finds config in grandparent directory", async () => {
        existsSpy.mockImplementation(async (filePath: string) => {
          return filePath === "/home/user/project/dotfiles.config.ts";
        });

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project/sub/deep"));

        expect(result).toBe("/home/user/project/dotfiles.config.ts");
      });

      it("stops walking at directory containing .git", async () => {
        existsSpy.mockImplementation(async (filePath: string) => {
          if (filePath === "/home/user/project/.git") return true;
          if (filePath === "/home/user/dotfiles.config.ts") return true;
          return false;
        });

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project/subdir"));

        expect(result).toBeUndefined();
      });

      it("stops walking at directory containing project.json", async () => {
        existsSpy.mockImplementation(async (filePath: string) => {
          if (filePath === "/home/user/project/project.json") return true;
          if (filePath === "/home/user/dotfiles.config.ts") return true;
          return false;
        });

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project/subdir"));

        expect(result).toBeUndefined();
      });

      it("stops walking at $HOME", async () => {
        existsSpy.mockImplementation(async (filePath: string) => {
          if (filePath === "/home/user/dotfiles.config.ts") return true;
          return false;
        });

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project/subdir"));

        expect(result).toBe("/home/user/dotfiles.config.ts");
      });

      it("does not walk above $HOME", async () => {
        existsSpy.mockImplementation(async (filePath: string) => {
          if (filePath === "/home/dotfiles.config.ts") return true;
          return false;
        });

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project"));

        expect(result).toBeUndefined();
      });

      it("checks config before boundary markers in the same directory", async () => {
        existsSpy.mockImplementation(async (filePath: string) => {
          if (filePath === "/home/user/project/dotfiles.config.ts") return true;
          if (filePath === "/home/user/project/.git") return true;
          return false;
        });

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project/subdir"));

        expect(result).toBe("/home/user/project/dotfiles.config.ts");
      });

      it("returns undefined when no config found up to boundary", async () => {
        existsSpy.mockResolvedValue(false);

        const result = await resolveConfigPath(logger, "", processInfo("/home/user/project/subdir"));

        expect(result).toBeUndefined();
      });
    });
  });

  describe("DEFAULT_CONFIG_FILES", () => {
    it("contains expected default file names", () => {
      expect(DEFAULT_CONFIG_FILES).toEqual(["dotfiles.config.ts"]);
    });
  });
});
