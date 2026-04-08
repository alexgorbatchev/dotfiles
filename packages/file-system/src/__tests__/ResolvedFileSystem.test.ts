import { describe, expect, it } from "bun:test";
import type { IFileSystem, NodeStats } from "../IFileSystem";
import { ResolvedFileSystem } from "../ResolvedFileSystem";
import type { FileMode, FileWriteContent, IRecursiveDirectoryOptions, IRemoveOptions, SymlinkKind } from "../types";

type SpyCall = {
  method: string;
  args: unknown[];
};

class SpyFileSystem implements IFileSystem {
  public readonly calls: SpyCall[] = [];

  public async readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
    this.calls.push({ method: "readFile", args: [filePath, encoding] });
    const result = "";
    return result;
  }

  public async readFileBuffer(filePath: string): Promise<Buffer> {
    this.calls.push({ method: "readFileBuffer", args: [filePath] });
    const result = Buffer.from("");
    return result;
  }

  public async writeFile(filePath: string, content: FileWriteContent, encoding?: BufferEncoding): Promise<void> {
    this.calls.push({ method: "writeFile", args: [filePath, content, encoding] });
  }

  public async exists(filePath: string): Promise<boolean> {
    this.calls.push({ method: "exists", args: [filePath] });
    const result = true;
    return result;
  }

  public async mkdir(dirPath: string, options?: IRecursiveDirectoryOptions): Promise<void> {
    this.calls.push({ method: "mkdir", args: [dirPath, options] });
  }

  public async readdir(dirPath: string): Promise<string[]> {
    this.calls.push({ method: "readdir", args: [dirPath] });
    const result: string[] = [];
    return result;
  }

  public async rm(filePath: string, options?: IRemoveOptions): Promise<void> {
    this.calls.push({ method: "rm", args: [filePath, options] });
  }

  public async rmdir(dirPath: string, options?: IRecursiveDirectoryOptions): Promise<void> {
    this.calls.push({ method: "rmdir", args: [dirPath, options] });
  }

  public async stat(filePath: string): Promise<NodeStats> {
    this.calls.push({ method: "stat", args: [filePath] });
    const result: NodeStats = {} as NodeStats;
    return result;
  }

  public async lstat(filePath: string): Promise<NodeStats> {
    this.calls.push({ method: "lstat", args: [filePath] });
    const result: NodeStats = {} as NodeStats;
    return result;
  }

  public async symlink(target: string, linkPath: string, type?: SymlinkKind): Promise<void> {
    this.calls.push({ method: "symlink", args: [target, linkPath, type] });
  }

  public async readlink(linkPath: string): Promise<string> {
    this.calls.push({ method: "readlink", args: [linkPath] });
    const result = "";
    return result;
  }

  public async chmod(filePath: string, mode: FileMode): Promise<void> {
    this.calls.push({ method: "chmod", args: [filePath, mode] });
  }

  public async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    this.calls.push({ method: "copyFile", args: [src, dest, flags] });
  }

  public async rename(oldPath: string, newPath: string): Promise<void> {
    this.calls.push({ method: "rename", args: [oldPath, newPath] });
  }

  public async ensureDir(dirPath: string): Promise<void> {
    this.calls.push({ method: "ensureDir", args: [dirPath] });
  }
}

function getLastCall(calls: SpyCall[], method: string): SpyCall {
  const matching: SpyCall[] = calls.filter((call) => call.method === method);
  expect(matching.length).toBe(1);
  const result = matching[0] as SpyCall;
  return result;
}

describe("ResolvedFileSystem", () => {
  const configuredHomeDir = "/configured-home";

  it("expands ~ and ~/ and ~\\ across all IFileSystem methods", async () => {
    const spy = new SpyFileSystem();
    const fs = new ResolvedFileSystem(spy, configuredHomeDir);

    await fs.readFile("~/file.txt", "utf-8");
    expect(getLastCall(spy.calls, "readFile").args[0]).toBe("/configured-home/file.txt");

    await fs.readFileBuffer("~\\file.txt");
    expect(getLastCall(spy.calls, "readFileBuffer").args[0]).toBe("/configured-home\\file.txt");

    await fs.writeFile("~", "x", "utf-8");
    expect(getLastCall(spy.calls, "writeFile").args[0]).toBe("/configured-home");

    await fs.exists("~/exists");
    expect(getLastCall(spy.calls, "exists").args[0]).toBe("/configured-home/exists");

    await fs.mkdir("~/.dir", { recursive: true });
    expect(getLastCall(spy.calls, "mkdir").args[0]).toBe("/configured-home/.dir");

    await fs.readdir("~/.config");
    expect(getLastCall(spy.calls, "readdir").args[0]).toBe("/configured-home/.config");

    await fs.rm("~/.rm", { recursive: true, force: true });
    expect(getLastCall(spy.calls, "rm").args[0]).toBe("/configured-home/.rm");

    await fs.rmdir("~/.rmdir", { recursive: true });
    expect(getLastCall(spy.calls, "rmdir").args[0]).toBe("/configured-home/.rmdir");

    await fs.stat("~/.stat");
    expect(getLastCall(spy.calls, "stat").args[0]).toBe("/configured-home/.stat");

    await fs.lstat("~/.lstat");
    expect(getLastCall(spy.calls, "lstat").args[0]).toBe("/configured-home/.lstat");

    await fs.symlink("~/target", "~/.link", "file");
    expect(getLastCall(spy.calls, "symlink").args[0]).toBe("/configured-home/target");
    expect(getLastCall(spy.calls, "symlink").args[1]).toBe("/configured-home/.link");

    await fs.readlink("~/.readlink");
    expect(getLastCall(spy.calls, "readlink").args[0]).toBe("/configured-home/.readlink");

    await fs.chmod("~/.chmod", 0o755);
    expect(getLastCall(spy.calls, "chmod").args[0]).toBe("/configured-home/.chmod");

    await fs.copyFile("~/src", "~/.dest");
    expect(getLastCall(spy.calls, "copyFile").args[0]).toBe("/configured-home/src");
    expect(getLastCall(spy.calls, "copyFile").args[1]).toBe("/configured-home/.dest");

    await fs.rename("~/old", "~/.new");
    expect(getLastCall(spy.calls, "rename").args[0]).toBe("/configured-home/old");
    expect(getLastCall(spy.calls, "rename").args[1]).toBe("/configured-home/.new");

    await fs.ensureDir("~/.ensureDir");
    expect(getLastCall(spy.calls, "ensureDir").args[0]).toBe("/configured-home/.ensureDir");
  });

  it("passes through non-tilde paths unchanged", async () => {
    const spy = new SpyFileSystem();
    const fs = new ResolvedFileSystem(spy, configuredHomeDir);

    await fs.readFile("/abs/file.txt", "utf-8");
    expect(getLastCall(spy.calls, "readFile").args[0]).toBe("/abs/file.txt");
  });

  it("does not expand ~user/... forms", async () => {
    const spy = new SpyFileSystem();
    const fs = new ResolvedFileSystem(spy, configuredHomeDir);

    await fs.readFile("~someone/file.txt", "utf-8");
    expect(getLastCall(spy.calls, "readFile").args[0]).toBe("~someone/file.txt");
  });
});
