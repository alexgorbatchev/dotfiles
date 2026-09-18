import type {
  Platform as DslPlatform,
  Architecture as DslArchitecture,
  ConfigFactory,
  AsyncConfigureTool,
  IPathModule,
  ISystemInfo,
  ShellStrings,
} from "./dsl-types";

function getGlobals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

export type Platform = DslPlatform;
export type Architecture = DslArchitecture;

type DependsOnFn = (dep: unknown) => unknown;

export const Platform = {
  Linux: 1,
  MacOS: 2,
  Windows: 4,
  All: 7,
} as const;

export const Architecture = {
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
  function matchesTarget(platforms: unknown, architectures: unknown): boolean;
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
  function fsRename(from: string, to: string): void;
  function fsSymlink(target: string, linkPath: string): void;
  function shellExec(toolName: string, command: string, cwd: string, quiet: boolean, noThrow: boolean): IShellOutput;
  function resolveGlob(pattern: string, baseDir: string): string;
  function replaceInFile(
    toolName: string,
    path: string,
    patternSource: string,
    patternFlags: string,
    literal: boolean,
    replacement: unknown,
    mode: string,
    errorMessage: string,
  ): boolean;
}

/**
 * A pattern to search for: a literal string, or a regular expression.
 */
export type ReplacePattern = string | RegExp;

/**
 * Options accepted by replaceInFile.
 */
export interface IReplaceInFileOptions {
  /**
   * Whether the pattern is applied to the whole file or to each line separately.
   */
  mode?: "file" | "line";
  /**
   * Reported when the pattern matches nothing, to explain what was expected.
   */
  errorMessage?: string;
}

/**
 * Outcome of a command run by the hook shell, mirroring what the shell reports.
 */
export interface IShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
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

  while (lines.length > 0 && lines[0] && lines[0].trim().length === 0) {
    lines.shift();
  }
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last && last.trim().length === 0) {
      lines.pop();
    } else {
      break;
    }
  }

  if (lines.length === 0) {
    return "";
  }

  let minIndent: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;
    let indent = 0;
    while (indent < line.length && (line.charAt(indent) === " " || line.charAt(indent) === "\t")) {
      indent++;
    }
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
    }
  }

  if (minIndent !== null && minIndent > 0) {
    const minCut = minIndent;
    return lines.map((line) => (line && line.length >= minCut ? line.slice(minCut) : line || "")).join("\n");
  }

  return lines.join("\n");
}

export type HookHandlerFn = (context: Record<string, unknown>) => unknown;

/**
 * Continuations a caller passes when awaiting a command.
 */
export type ShellFulfilledFn = (value: IShellOutput) => unknown;
export type ShellRejectedFn = (reason: unknown) => unknown;

/**
 * Lifecycle events the installation pipeline emits. Registering anything else is a
 * mistake worth reporting at load time, because a handler for an event that is never
 * emitted would simply never run.
 */
const SUPPORTED_HOOK_EVENTS = ["before-install", "after-download", "after-extract", "after-install"];

/**
 * Keys a handler by tool and event. A single VM evaluates every tool file in the
 * project, so the tool name has to be part of the key.
 */
function hookKey(toolName: string, event: string): string {
  return toolName + "::" + event;
}

/**
 * Records a lifecycle handler so Go can invoke it when the installation reaches that
 * event. Handlers are keyed by tool and event because a single VM evaluates every tool
 * file in the project.
 */
function registerHookHandler(toolName: string, event: string, handler: HookHandlerFn): void {
  const globals = getGlobals();
  const registry = (globals["__hookHandlers"] || (globals["__hookHandlers"] = {})) as Record<string, HookHandlerFn[]>;
  const key = hookKey(toolName, event);
  const handlers = registry[key] || (registry[key] = []);
  handlers.push(handler);
}

/**
 * Builds the shell executor handed to lifecycle hooks.
 *
 * Execution is deferred until the result is awaited so that the chainable modifiers
 * run before the command does, matching how the shell reads at the call site:
 * `await $`cmd`.quiet()` must not have executed loudly by the time `.quiet()` is
 * reached. `shellExec` is a Go binding that runs the command and reports its outcome.
 */
function createHookShell(toolName: string, cwd: string) {
  return (strings: ShellStrings, ...values: unknown[]) => {
    let command = "";
    if (Array.isArray(strings)) {
      for (let i = 0; i < strings.length; i++) {
        command += strings[i];
        if (i < values.length) {
          command += String(values[i]);
        }
      }
    } else if (typeof strings === "string") {
      command = strings;
    }

    let quiet = false;
    let noThrow = false;

    const run = () => shellExec(toolName, command, cwd, quiet, noThrow) as IShellOutput;

    const result = {
      quiet() {
        quiet = true;
        return result;
      },
      noThrow() {
        noThrow = true;
        return result;
      },
      text() {
        return Promise.resolve(run().stdout);
      },
      json() {
        return Promise.resolve(JSON.parse(run().stdout));
      },
      then(onFulfilled?: ShellFulfilledFn, onRejected?: ShellRejectedFn) {
        let settled: Promise<IShellOutput>;
        try {
          settled = Promise.resolve(run());
        } catch (error) {
          settled = Promise.reject(error);
        }
        return settled.then(onFulfilled, onRejected);
      },
    };

    return result;
  };
}

/**
 * Builds the context object handed to a tool factory and to its lifecycle hooks.
 *
 * `eventContext` carries the values that only exist once an installation is under way
 * -- the staging directory, the downloaded archive, the extracted tree, the installed
 * location -- and is empty while the configuration is merely being read. Everything
 * else is derived from the project layout and is known at both times.
 */
function createToolContext(toolName: string, eventContext: Record<string, unknown>): Record<string, unknown> {
  const toolPath = globalThis.currentToolPath || "";
  const toolDir = toolPath
    ? globalThis.path.dirname(toolPath)
    : (globalThis.configFileDir || "") + "/tools/" + toolName;
  const bDir = globalThis.binariesDir || "";
  const currentDir = bDir ? bDir + "/" + toolName + "/current" : toolDir;
  const defaultPaths = {
    dotfilesDir: globalThis.configFileDir || "",
    toolConfigsDir: (globalThis.configFileDir || "") + "/tools",
    generatedDir: (globalThis.configFileDir || "") + "/.generated",
    homeDir: (globalThis.configFileDir || "") + "/.generated/home",
    targetDir: (globalThis.configFileDir || "") + "/.generated/bin",
    shellScriptsDir: (globalThis.configFileDir || "") + "/.generated/shell-scripts",
    binariesDir: (globalThis.configFileDir || "") + "/.generated/binaries",
  };
  const activeProjCfg = (getGlobals()["projectConfig"] || {}) as Record<string, unknown>;

  const fileSystem = {
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
    ensureDir(p: string) {
      fsMkdir(p);
      return Promise.resolve();
    },
    rm(p: string) {
      fsRm(p);
      return Promise.resolve();
    },
    rename(from: string, to: string) {
      fsRename(from, to);
      return Promise.resolve();
    },
    symlink(target: string, linkPath: string) {
      fsSymlink(target, linkPath);
      return Promise.resolve();
    },
  };

  const replaceInFileFn = (
    filePath: string,
    from: ReplacePattern,
    to: unknown,
    options?: IReplaceInFileOptions,
  ): Promise<boolean> => {
    const isRegExp = from instanceof RegExp;
    const source = isRegExp ? from.source : String(from);
    const flags = isRegExp ? from.flags : "";
    const opts = options || {};
    return Promise.resolve(
      replaceInFile(toolName, filePath, source, flags, !isRegExp, to, opts.mode || "file", opts.errorMessage || ""),
    );
  };

  const context: Record<string, unknown> = {
    replaceInFile: replaceInFileFn,
    resolve: (pattern: string) => resolveGlob(pattern, toolDir),
    toolName: toolName,
    configFileDir: globalThis.configFileDir || "",
    toolDir: toolDir,
    projectConfig: activeProjCfg["paths"] ? activeProjCfg : { paths: defaultPaths },
    currentDir: currentDir,
    // At configuration time the staging directory does not exist yet, so the tool
    // context carries the placeholder Go resolves later. A hook runs during an
    // installation and receives the real path through eventContext instead.
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
    fs: fileSystem,
    // Documented as `fileSystem` on the hook context and as `fs` on the tool context.
    // Both names address the same bindings rather than one shadowing the other.
    fileSystem: fileSystem,
  };

  // No shell here. Configuration is evaluated on every CLI invocation merely to read
  // what a tool is, so a tool factory must not be able to run commands. Only a hook,
  // which runs during an actual installation, is given a shell -- see invokeHook.

  for (const key of Object.keys(eventContext)) {
    context[key] = eventContext[key];
  }

  return context;
}

/**
 * Invoked from Go when an installation reaches a lifecycle event. Returns a promise
 * that settles once every handler registered for the event has finished, so a failure
 * inside a hook surfaces instead of being discarded.
 */
function invokeHook(toolName: string, event: string, eventContext: Record<string, unknown>): Promise<unknown> {
  const registry = (getGlobals()["__hookHandlers"] || {}) as Record<string, HookHandlerFn[]>;
  const handlers = registry[hookKey(toolName, event)] || [];
  const context = createToolContext(toolName, eventContext);
  // Go decides where commands run, because it is the side that can tell whether the
  // installed tree exists yet.
  context["$"] = createHookShell(toolName, (getGlobals()["__hookCwd"] as string) || "");
  return Promise.all(handlers.map((handler) => Promise.resolve(handler(context))));
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
    getGlobals()["projectConfig"] = pCfg;
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
      if (SUPPORTED_HOOK_EVENTS.indexOf(name) === -1) {
        throw new Error(
          "Unknown lifecycle event " +
            JSON.stringify(name) +
            " passed to .hook(): expected one of " +
            SUPPORTED_HOOK_EVENTS.join(", ") +
            ". Registering an event nothing emits would leave the handler silently unused.",
        );
      }
      if (typeof cb === "function") {
        // The handler is kept as a live function and invoked later, when the
        // installation actually reaches this lifecycle event. Only the set of event
        // names crosses the JSON boundary into Go, so the orchestrator knows which
        // events are worth re-entering the VM for.
        const toolName = (this["name"] as string) || globalThis.currentToolName || "";
        registerHookHandler(toolName, name, cb as HookHandlerFn);

        const ip = (this["installParams"] || {}) as Record<string, unknown>;
        const events = (ip["hooks"] || []) as string[];
        if (events.indexOf(name) === -1) {
          events.push(name);
        }
        ip["hooks"] = events;
        this["installParams"] = ip;
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

      // An architecture argument that arrived as undefined is a misspelled member
      // rather than the two-argument form, which Go cannot distinguish from "no
      // architecture given" once the value is passed across.
      const archGiven = typeof arg2 !== "function";
      if (archGiven && arch === undefined) {
        throw new Error(
          "Unknown architecture value passed to .platform(): expected one of the Architecture constants (check for a misspelled member)",
        );
      }

      const matches = matchesTarget(plat, archGiven ? arch : null);

      this["_hasPlatformBlocks"] = true;

      if (matches) {
        this["_hasMatchingPlatform"] = true;
        delete this["disabled"];
        if (cb) cb(install);
      } else if (!this["_hasMatchingPlatform"]) {
        this["disabled"] = true;
      }
      return this;
    },

    arch(arc: unknown, cb: Function) {
      const matches = matchesTarget(Platform.All, arc);

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
        sources.push(dedentString(content));
        shConfig["sources"] = sources;
        return this;
      },
    };
  }

  function install(method: string, params?: unknown): unknown {
    if (method) {
      builder["installationMethod"] = method;
      if (method === "brew") {
        const deps = (builder["dependencies"] || []) as unknown[];
        if (!deps.includes("brew")) {
          deps.push("brew");
        }
        builder["dependencies"] = deps;
      }
    }
    if (params) {
      builder["installParams"] = params as Record<string, unknown>;
    }
    return builder;
  }

  const toolCtx = createToolContext(globalThis.currentToolName || "", {});

  function cleanInternalProps(obj: Record<string, unknown>) {
    delete obj["_version"];
    delete obj["_hasPlatformBlocks"];
    delete obj["_hasMatchingPlatform"];
    delete obj["_hasArchBlocks"];
    delete obj["_hasMatchingArch"];
  }

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
      const resObj = res as Record<string, unknown>;
      resObj["version"] = resObj["_version"] || "latest";
      cleanInternalProps(resObj);
      cleanInternalProps(builder as Record<string, unknown>);
      if (!resObj["configFilePath"]) {
        resObj["configFilePath"] = globalThis.currentToolPath || "";
      }
      return res;
    }
  }
  const builderObj = builder as unknown as Record<string, unknown>;
  builderObj["version"] = builderObj["_version"] || "latest";
  cleanInternalProps(builderObj);
  builderObj["configFilePath"] = globalThis.currentToolPath || "";
  return builder;
}

export const dedentTemplate = dedentString;

// Ensure global registration
getGlobals()["defineConfig"] = defineConfig;
getGlobals()["defineTool"] = defineTool;
// Go calls this when an installation reaches a lifecycle event.
getGlobals()["__invokeHook"] = invokeHook;
getGlobals()["dedentString"] = dedentString;
getGlobals()["dedentTemplate"] = dedentString;
getGlobals()["Platform"] = Platform;
getGlobals()["Architecture"] = Architecture;
