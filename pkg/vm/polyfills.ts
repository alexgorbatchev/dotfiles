export interface IFSModule {
  existsSync(p: string): boolean;
}

export interface IPathModule {
  isAbsolute(p: string): boolean;
  join(...args: string[]): string;
  dirname(p: string): string;
  basename(p: string): string;
}

const fs: IFSModule = {
  existsSync(p: string): boolean {
    return fileExists(p);
  },
};

const path: IPathModule = {
  isAbsolute(p: string): boolean {
    return !!(p && (p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:/.test(p)));
  },
  join(...args: string[]): string {
    return args.join("/").replace(/\/+/g, "/");
  },
  dirname(p: string): string {
    if (!p) return "";
    const parts = p.split("/");
    if (parts.length <= 1) return ".";
    parts.pop();
    return parts.join("/") || "/";
  },
  basename(p: string): string {
    if (!p) return "";
    const parts = p.split("/");
    return parts[parts.length - 1] || "";
  },
};

const modules: Record<string, unknown> = {
  "node:fs": fs,
  fs: fs,
  "node:path": path,
  path: path,
};

export type RequireFunction = (name: string) => unknown;

const requireFunc: RequireFunction = (name: string): unknown => {
  if (modules[name]) {
    return modules[name];
  }
  throw new Error("Module not found: " + name);
};

// Ensure typechecked assignment to globalThis
(globalThis as unknown as Record<string, unknown>)["fs"] = fs;
(globalThis as unknown as Record<string, unknown>)["path"] = path;
(globalThis as unknown as Record<string, unknown>)["require"] = requireFunc;
