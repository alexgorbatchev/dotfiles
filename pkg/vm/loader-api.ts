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

export interface ISystemInfo {
  os: string;
  arch: string;
  libc: string;
}

export interface IConfigContext {
  configFileDir: string;
  systemInfo: ISystemInfo;
}

export type ShellStrings = TemplateStringsArray | string;

export interface IToolConfigContext {
  toolName: string;
  configFileDir: string;
  currentDir: string;
  stagingDir: string;
  systemInfo: ISystemInfo;
  log: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
    debug(msg: string): void;
  };
  fs: {
    exists(p: string): boolean;
    readDir(p: string): string[];
    readFile(p: string): string;
  };
  $: (strings: ShellStrings, ...values: unknown[]) => Promise<string>;
}

export interface IShellConfigs {
  zsh?: unknown;
  bash?: unknown;
  powershell?: unknown;
}

export interface IToolBuilder {
  name: string;
  installationMethod: string;
  installParams: Record<string, unknown>;
  binaries: unknown[];
  dependencies: unknown[];
  symlinks: unknown[];
  copies: unknown[];
  shellConfigs: Record<string, unknown>;
  configFilePath?: string;
  [key: string]: unknown;

  bin(name: unknown, pattern?: unknown): IToolBuilder;
  version(v: unknown): IToolBuilder;
  sudo(): IToolBuilder;
  disable(): IToolBuilder;
  hostname(pattern: unknown): IToolBuilder;
  updateCheck(config: unknown): IToolBuilder;
  copy(src: unknown, dst: unknown): IToolBuilder;
  dependsOn(dep: unknown): IToolBuilder;
  depends(dep: unknown): IToolBuilder;
  symlink(src: unknown, dst: unknown): IToolBuilder;
  hook(name: string, cb: unknown): IToolBuilder;
  zsh(cb: ShellCallback): IToolBuilder;
  bash(cb: ShellCallback): IToolBuilder;
  powershell(cb: ShellCallback): IToolBuilder;
  platform(plat: unknown, cb: PlatformCallback): IToolBuilder;
  arch(arc: unknown, cb: ArchCallback): IToolBuilder;
}

export type ConfigFactory = (context: IConfigContext) => unknown;
export type ToolFactory = (
  install: (method: string, params?: unknown) => IToolBuilder,
  ctx: IToolConfigContext,
) => unknown;

export interface IPathModule {
  isAbsolute(p: string): boolean;
  join(...args: string[]): string;
  dirname(p: string): string;
  basename(p: string): string;
}

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
}

export type PlatformCallback = (install: (method: string, params?: unknown) => IToolBuilder) => void;
export type ArchCallback = (install: (method: string, params?: unknown) => IToolBuilder) => void;
export type ShellCallback = (shell: Record<string, unknown>) => void;
export type DefineConfigCallback = ConfigFactory | unknown;

export function defineConfig(callback: DefineConfigCallback): unknown {
  if (typeof callback === "function") {
    return callback({
      configFileDir: globalThis.configFileDir || "",
      systemInfo: {
        os: getOS(),
        arch: getArch(),
        libc: detectLibc(),
      },
    });
  }
  return callback;
}

export function defineTool(callback: ToolFactory): unknown {
  const builder: IToolBuilder = {
    name: "",
    installationMethod: "",
    installParams: {} as Record<string, unknown>,
    binaries: [] as unknown[],
    dependencies: [] as unknown[],
    symlinks: [] as unknown[],
    copies: [] as unknown[],
    shellConfigs: {} as Record<string, unknown>,

    bin(name: unknown, pattern: unknown) {
      const b = this.binaries as unknown[];
      if (pattern !== undefined) {
        b.push({ name: name, pattern: pattern });
      } else if (Array.isArray(name)) {
        this.binaries = name;
      } else {
        this.binaries = Array.prototype.slice.call(arguments);
      }
      return this;
    },

    version(v: unknown) {
      (this as Record<string, unknown>)["version"] = v;
      return this;
    },

    sudo() {
      (this as Record<string, unknown>)["sudo"] = true;
      return this;
    },

    disable() {
      (this as Record<string, unknown>)["disabled"] = true;
      return this;
    },

    hostname(pattern: unknown) {
      (this as Record<string, unknown>)["hostname"] = pattern;
      return this;
    },

    updateCheck(config: unknown) {
      (this as Record<string, unknown>)["updateCheck"] = config;
      return this;
    },

    copy(src: unknown, dst: unknown) {
      const c = this.copies as unknown[];
      c.push({ source: src, target: dst });
      this.copies = c;
      return this;
    },

    dependsOn(dep: unknown) {
      let d = this.dependencies as unknown[];
      if (Array.isArray(dep)) {
        d = d.concat(dep);
      } else {
        d.push(dep);
      }
      this.dependencies = d;
      return this;
    },

    depends(dep: unknown) {
      return this.dependsOn(dep);
    },

    symlink(src: unknown, dst: unknown) {
      const s = this.symlinks as unknown[];
      s.push({ source: src, target: dst });
      this.symlinks = s;
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
          toolName: (this.name as string) || globalThis.currentToolName || "",
        };

        cb(hookCtx);

        if (commands.length > 0) {
          const ip = this.installParams as Record<string, unknown>;
          const hooks = (ip["hooks"] || {}) as Record<string, unknown>;
          hooks[name] = commands;
          ip["hooks"] = hooks;
          this.installParams = ip;
        }
      }
      return this;
    },

    zsh(cb: ShellCallback) {
      const sc = this.shellConfigs as Record<string, unknown>;
      sc["zsh"] ??= { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(sc["zsh"] as Record<string, unknown>, "zsh"));
      return this;
    },

    bash(cb: ShellCallback) {
      const sc = this.shellConfigs as Record<string, unknown>;
      sc["bash"] ??= { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(sc["bash"] as Record<string, unknown>, "bash"));
      return this;
    },

    powershell(cb: ShellCallback) {
      const sc = this.shellConfigs as Record<string, unknown>;
      sc["powershell"] ??= { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(sc["powershell"] as Record<string, unknown>, "powershell"));
      return this;
    },

    platform(plat: unknown, cb: PlatformCallback) {
      const currentOS = getOS();
      let matches = false;
      if (plat === Platform.All) matches = true;
      else if (plat === Platform.MacOS && currentOS === "darwin") matches = true;
      else if (plat === Platform.Linux && currentOS === "linux") matches = true;

      if (matches) {
        cb(install);
      } else {
        this["disabled"] = true;
      }
      return this;
    },

    arch(arc: unknown, cb: ArchCallback) {
      const currentArch = getArch();
      let matches = false;
      if (arc === Architecture.All) matches = true;
      else if (arc === Architecture.Arm64 && currentArch === "arm64") matches = true;
      else if (arc === Architecture.X86_64 && currentArch === "amd64") matches = true;

      if (matches) {
        cb(install);
      } else {
        this["disabled"] = true;
      }
      return this;
    },
  };

  (builder as unknown as Record<string, string>)["version"] = "latest";

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
      script(type: string, val: string) {
        if (arguments.length === 1) {
          shScripts.push({ kind: "always", value: arguments[0] });
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

  function install(method: string, params?: unknown): IToolBuilder {
    if (method) {
      builder.installationMethod = method;
    }
    if (params) {
      builder.installParams = params as Record<string, unknown>;
    }
    return builder;
  }

  // Construct toolCtx parameter
  const toolName = globalThis.currentToolName || "";
  const toolPath = globalThis.currentToolPath || "";
  const bDir = globalThis.binariesDir || "";
  const currentDir = bDir ? bDir + "/" + toolName + "/current" : globalThis.path.dirname(toolPath);
  const toolCtx: IToolConfigContext = {
    toolName: toolName,
    configFileDir: globalThis.configFileDir || "",
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
        return fsExists(p);
      },
      readDir(p: string) {
        return fsReadDir(p);
      },
      readFile(p: string) {
        return fsReadFile(p);
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
    const res = callback(install, toolCtx);
    if (builder.installParams && typeof builder.installParams["args"] === "function") {
      builder.installParams["args"] = (builder.installParams["args"] as Function)(toolCtx);
    }
    if (res && (res as Record<string, unknown>)["installationMethod"]) {
      return res as IToolBuilder;
    }
  }
  return builder;
}

// Ensure global registration
(globalThis as unknown as Record<string, unknown>)["defineConfig"] = defineConfig;
(globalThis as unknown as Record<string, unknown>)["defineTool"] = defineTool;
(globalThis as unknown as Record<string, unknown>)["Platform"] = Platform;
(globalThis as unknown as Record<string, unknown>)["Architecture"] = Architecture;
