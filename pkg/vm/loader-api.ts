import type {
  Platform as DslPlatform,
  Architecture as DslArchitecture,
  ConfigFactory,
  AsyncConfigureTool,
  IPathModule,
  ISystemInfo,
  ShellStrings,
} from "./dsl-types";

export type Platform = DslPlatform;
export type Architecture = DslArchitecture;

type DependsOnFn = (dep: unknown) => unknown;

export const Platform = {
  None: 0,
  Linux: 1,
  MacOS: 2,
  Windows: 4,
  Unix: 3,
  All: 7,
} as const;

export const Architecture = {
  None: 0,
  X86_64: 1,
  Arm64: 2,
  All: 3,
} as const;

// Declare the Go-bound environment functions in global scope for TypeScript compilation
declare global {
  var configFileDir: string;
  var binariesDir: string;
  var systemInfo: ISystemInfo;
  var currentToolName: string;
  var currentToolPath: string;
  var path: IPathModule;
  function getOS(): string;
  function getArch(): string;
  function detectLibc(): string;
  function fileExists(path: string): boolean;
  function logInfo(toolName: string, msg: string): void;
  function logWarn(toolName: string, msg: string): void;
  function logError(toolName: string, msg: string): void;
  function logDebug(toolName: string, msg: string): void;
  function fsExists(path: string): boolean;
  function fsReadDir(path: string): string[];
  function fsReadFile(path: string): string;
  function fsWriteFile(path: string, content: string): void;
  function fsMkdir(path: string): void;
  function fsRm(path: string): void;
}

type ConfigRunner = (ctx: unknown) => unknown;
type ToolRunner = (install: unknown, ctx: unknown) => unknown;
type DedentInput = string | TemplateStringsArray;

/**
 * Strips leading indent from a multiline template string.
 */
export function dedentString(text: DedentInput, ...values: unknown[]): string {
  let str = "";
  if (typeof text === "string") {
    str = text;
  } else if (Array.isArray(text)) {
    for (let i = 0; i < text.length; i++) {
      str += text[i];
      if (i < values.length) {
        str += String(values[i]);
      }
    }
  }

  const lines = str.split("\n");
  let minIndent: number | null = null;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const indent = line.search(/\S/);
    if (indent !== -1) {
      if (minIndent === null || indent < minIndent) {
        minIndent = indent;
      }
    }
  }

  if (minIndent !== null && minIndent > 0) {
    const minCut = minIndent;
    return lines
      .map((line) => (line.length >= minCut ? line.slice(minCut) : line))
      .join("\n")
      .trim();
  }

  return str.trim();
}

/**
 * Defines the main dotfiles project configuration.
 *
 * @param callback Factory function returning project configuration paths, features, and settings.
 */
export function defineConfig(callback: ConfigFactory): unknown {
  if (typeof callback === "function") {
    const fn = callback as ConfigRunner;
    const res = fn({
      configFileDir: globalThis.configFileDir || "",
      systemInfo: {
        os: getOS(),
        arch: getArch(),
        libc: detectLibc(),
      },
    });
    const parsedObj = res as Record<string, unknown>;
    const pCfg = parsedObj && parsedObj["projectConfig"] ? parsedObj["projectConfig"] : res;
    (globalThis as unknown as Record<string, unknown>)["projectConfig"] = pCfg;
    return res;
  }
  return callback;
}

/**
 * Defines a tool configuration for installation and shell integration.
 *
 * @param callback Builder function configuring installer, binaries, symlinks, and shell settings.
 */
export function defineTool(callback: AsyncConfigureTool): unknown {
  const builder: Record<string, unknown> = {
    name: "",
    installationMethod: "",
    installParams: {} as Record<string, unknown>,
    binaries: [] as unknown[],
    dependencies: [] as unknown[],
    symlinks: [] as unknown[],
    copies: [] as unknown[],
    shellConfigs: {} as Record<string, unknown>,

    bin(name: unknown, pattern: unknown) {
      let b = (this["binaries"] || []) as unknown[];
      if (pattern !== undefined) {
        b.push({ name: name, pattern: pattern });
      } else if (Array.isArray(name)) {
        b = b.concat(name);
      } else {
        const args = Array.prototype.slice.call(arguments);
        for (const arg of args) {
          b.push(arg);
        }
      }
      this["binaries"] = b;
      return this;
    },

    version(v: unknown) {
      this["_version"] = v;
      return this;
    },

    sudo() {
      this["sudo"] = true;
      return this;
    },

    disable() {
      this["disabled"] = true;
      return this;
    },

    hostname(pattern: unknown) {
      this["hostname"] = pattern;
      return this;
    },

    updateCheck(config: unknown) {
      this["updateCheck"] = config;
      return this;
    },

    copy(src: unknown, dst: unknown) {
      const c = (this["copies"] || []) as unknown[];
      c.push({ source: src, target: dst });
      this["copies"] = c;
      return this;
    },

    dependsOn(dep: unknown) {
      let d = (this["dependencies"] || []) as unknown[];
      if (Array.isArray(dep)) {
        d = d.concat(dep);
      } else {
        d.push(dep);
      }
      this["dependencies"] = d;
      return this;
    },

    depends(dep: unknown) {
      return (this["dependsOn"] as DependsOnFn)(dep);
    },

    symlink(src: unknown, dst: unknown) {
      const s = (this["symlinks"] || []) as unknown[];
      s.push({ source: src, target: dst });
      this["symlinks"] = s;
      return this;
    },

    hook(name: string, cb: unknown) {
      if (typeof cb === "function") {
        const commands: string[] = [];
        const mockShell = (strings: ShellStrings, ...values: unknown[]) => {
          let result = "";
          if (Array.isArray(strings)) {
            for (let i = 0; i < strings.length; i++) {
              result += strings[i];
              if (i < values.length) {
                result += String(values[i]);
              }
            }
          } else if (typeof strings === "string") {
            result = strings;
          }
          commands.push(result);
          return Promise.resolve("");
        };

        const hookCtx = {
          $: mockShell,
          toolName: (this["name"] as string) || globalThis.currentToolName || "",
        };

        cb(hookCtx);

        if (commands.length > 0) {
          const ip = (this["installParams"] || {}) as Record<string, unknown>;
          const hooks = (ip["hooks"] || {}) as Record<string, unknown>;
          hooks[name] = commands;
          ip["hooks"] = hooks;
          this["installParams"] = ip;
        }
      }
      return this;
    },

    zsh(cb: Function) {
      const sc = (this["shellConfigs"] || {}) as Record<string, unknown>;
      sc["zsh"] ??= { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(sc["zsh"] as Record<string, unknown>, "zsh"));
      return this;
    },

    bash(cb: Function) {
      const sc = (this["shellConfigs"] || {}) as Record<string, unknown>;
      sc["bash"] ??= { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(sc["bash"] as Record<string, unknown>, "bash"));
      return this;
    },

    powershell(cb: Function) {
      const sc = (this["shellConfigs"] || {}) as Record<string, unknown>;
      sc["powershell"] ??= { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(sc["powershell"] as Record<string, unknown>, "powershell"));
      return this;
    },

    platform(plat: unknown, arg2: unknown, arg3?: unknown) {
      let arch: unknown = undefined;
      let cb: Function | undefined = undefined;

      if (typeof arg2 === "function") {
        cb = arg2 as Function;
      } else {
        arch = arg2;
        if (typeof arg3 === "function") {
          cb = arg3 as Function;
        }
      }

      const currentOS = getOS();
      let matchesOS = false;
      if (plat === Platform.All) matchesOS = true;
      else if (plat === Platform.MacOS && currentOS === "darwin") matchesOS = true;
      else if (plat === Platform.Linux && currentOS === "linux") matchesOS = true;
      else if (plat === Platform.Windows && currentOS === "windows") matchesOS = true;

      let matchesArch = true;
      if (arch !== undefined) {
        const currentArch = getArch();
        if (arch === Architecture.All) matchesArch = true;
        else if (arch === Architecture.Arm64 && currentArch === "arm64") matchesArch = true;
        else if (arch === Architecture.X86_64 && currentArch === "amd64") matchesArch = true;
        else matchesArch = false;
      }

      this["_hasPlatformBlocks"] = true;

      if (matchesOS && matchesArch) {
        this["_hasMatchingPlatform"] = true;
        delete this["disabled"];
        if (cb) cb(install);
      } else if (!this["_hasMatchingPlatform"]) {
        this["disabled"] = true;
      }
      return this;
    },

    arch(arc: unknown, cb: Function) {
      const currentArch = getArch();
      let matches = false;
      if (arc === Architecture.All) matches = true;
      else if (arc === Architecture.Arm64 && currentArch === "arm64") matches = true;
      else if (arc === Architecture.X86_64 && currentArch === "amd64") matches = true;

      this["_hasArchBlocks"] = true;

      if (matches) {
        this["_hasMatchingArch"] = true;
        delete this["disabled"];
        if (typeof cb === "function") cb(install);
      } else if (!this["_hasMatchingArch"]) {
        this["disabled"] = true;
      }
      return this;
    },
  };

  (builder as unknown as Record<string, string>)["_version"] = "latest";

  function createShellBuilder(shConfig: Record<string, unknown>, _shellType: string) {
    const shFunctions = (shConfig["functions"] || {}) as Record<string, string>;
    shConfig["functions"] = shFunctions;
    const shScripts = (shConfig["scripts"] || []) as unknown[];
    shConfig["scripts"] = shScripts;

    return {
      env(map: Record<string, string>) {
        const envMap = (shConfig["env"] || {}) as Record<string, string>;
        Object.assign(envMap, map);
        shConfig["env"] = envMap;
        return this;
      },
      alias(map: Record<string, string>) {
        const aliasMap = (shConfig["aliases"] || {}) as Record<string, string>;
        Object.assign(aliasMap, map);
        shConfig["aliases"] = aliasMap;
        return this;
      },
      aliases(map: Record<string, string>) {
        return this.alias(map);
      },
      script(type: string, val?: string) {
        if (val === undefined) {
          shScripts.push({ kind: "always", value: type });
        } else {
          shScripts.push({ kind: type, value: val });
        }
        return this;
      },
      once(val: string) {
        shScripts.push({ kind: "once", value: val });
        return this;
      },
      always(val: string) {
        shScripts.push({ kind: "always", value: val });
        return this;
      },
      completions(val: unknown) {
        shConfig["completions"] = val;
        return this;
      },
      functions(values: Record<string, string>) {
        Object.assign(shFunctions, values);
        return this;
      },
      path(val: string) {
        const paths = (shConfig["paths"] || []) as string[];
        paths.push(val);
        shConfig["paths"] = paths;
        return this;
      },
      sourceFile(relativePath: string) {
        const sourceFiles = (shConfig["sourceFiles"] || []) as string[];
        sourceFiles.push(relativePath);
        shConfig["sourceFiles"] = sourceFiles;
        return this;
      },
      sourceFunction(functionName: string) {
        const sourceFunctions = (shConfig["sourceFunctions"] || []) as string[];
        sourceFunctions.push(functionName);
        shConfig["sourceFunctions"] = sourceFunctions;
        return this;
      },
      source(content: string) {
        const sources = (shConfig["sources"] || []) as string[];
        sources.push(content);
        shConfig["sources"] = sources;
        return this;
      },
    };
  }

  function install(method: string, params?: unknown): unknown {
    if (method) {
      builder["installationMethod"] = method;
    }
    if (params) {
      builder["installParams"] = params as Record<string, unknown>;
    }
    return builder;
  }

  // Construct toolCtx parameter
  const toolName = globalThis.currentToolName || "";
  const toolPath = globalThis.currentToolPath || "";
  const bDir = globalThis.binariesDir || "";
  const currentDir = bDir ? bDir + "/" + toolName + "/current" : globalThis.path.dirname(toolPath);
  const defaultPaths = {
    dotfilesDir: globalThis.configFileDir || "",
    toolConfigsDir: (globalThis.configFileDir || "") + "/tools",
    generatedDir: (globalThis.configFileDir || "") + "/.generated",
    homeDir: (globalThis.configFileDir || "") + "/.generated/home",
    targetDir: (globalThis.configFileDir || "") + "/.generated/bin",
    shellScriptsDir: (globalThis.configFileDir || "") + "/.generated/shell-init",
    binariesDir: (globalThis.configFileDir || "") + "/.generated/binaries",
  };
  const activeProjCfg = ((globalThis as unknown as Record<string, unknown>)["projectConfig"] || {}) as Record<
    string,
    unknown
  >;

  const toolCtx = {
    toolName: toolName,
    configFileDir: globalThis.configFileDir || "",
    projectConfig: activeProjCfg["paths"] ? activeProjCfg : { paths: defaultPaths },
    currentDir: currentDir,
    stagingDir: "{stagingDir}",
    systemInfo: {
      os: getOS(),
      arch: getArch(),
      libc: detectLibc(),
    },
    log: {
      info(msg: string) {
        logInfo(toolName, msg);
      },
      warn(msg: string) {
        logWarn(toolName, msg);
      },
      error(msg: string) {
        logError(toolName, msg);
      },
      debug(msg: string) {
        logDebug(toolName, msg);
      },
    },
    fs: {
      exists(p: string) {
        return Promise.resolve(fsExists(p));
      },
      readdir(p: string) {
        return Promise.resolve(fsReadDir(p));
      },
      readFile(p: string, _encoding?: string) {
        return Promise.resolve(fsReadFile(p));
      },
      writeFile(p: string, content: string, _encoding?: string) {
        fsWriteFile(p, content);
        return Promise.resolve();
      },
      mkdir(p: string) {
        fsMkdir(p);
        return Promise.resolve();
      },
      rm(p: string) {
        fsRm(p);
        return Promise.resolve();
      },
    },
    $: (strings: ShellStrings, ...values: unknown[]) => {
      let result = "";
      if (Array.isArray(strings)) {
        for (let i = 0; i < strings.length; i++) {
          result += strings[i];
          if (i < values.length) {
            result += String(values[i]);
          }
        }
      } else if (typeof strings === "string") {
        result = strings;
      }
      return Promise.resolve(result);
    },
  };

  if (typeof callback === "function") {
    const fn = callback as ToolRunner;
    const res = fn(install, toolCtx);
    if (builder["installParams"] && typeof builder["installParams"] === "object") {
      const ip = builder["installParams"] as Record<string, unknown>;
      if (typeof ip["args"] === "function") {
        ip["args"] = (ip["args"] as Function)(toolCtx);
      }
      if (typeof ip["env"] === "function") {
        ip["env"] = (ip["env"] as Function)(toolCtx);
      }
    }
    if (
      res &&
      typeof res === "object" &&
      typeof (res as Record<string, unknown>)["then"] !== "function" &&
      (res as Record<string, unknown>)["installationMethod"]
    ) {
      (res as Record<string, unknown>)["version"] = (res as Record<string, unknown>)["_version"] || "latest";
      delete (res as Record<string, unknown>)["_version"];
      if (!(res as Record<string, unknown>)["configFilePath"]) {
        (res as Record<string, unknown>)["configFilePath"] = globalThis.currentToolPath || "";
      }
      return res;
    }
  }
  (builder as unknown as Record<string, unknown>)["version"] =
    (builder as unknown as Record<string, unknown>)["_version"] || "latest";
  delete (builder as unknown as Record<string, unknown>)["_version"];
  (builder as unknown as Record<string, unknown>)["configFilePath"] = globalThis.currentToolPath || "";
  return builder;
}

// Ensure global registration
(globalThis as unknown as Record<string, unknown>)["defineConfig"] = defineConfig;
(globalThis as unknown as Record<string, unknown>)["defineTool"] = defineTool;
(globalThis as unknown as Record<string, unknown>)["dedentString"] = dedentString;
(globalThis as unknown as Record<string, unknown>)["Platform"] = Platform;
(globalThis as unknown as Record<string, unknown>)["Architecture"] = Architecture;
