import { Architecture, Libc, Platform } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";

interface IProcessReportHeader {
  glibcVersionRuntime?: string;
  glibcVersionCompiler?: string;
}

interface IProcessReport {
  header?: IProcessReportHeader;
}

export interface IDetectLibcDependencies {
  fileSystem: Pick<IFileSystem, "exists">;
  getProcessReport?: () => IProcessReport | undefined;
}

interface ILoaderPaths {
  gnu: string[];
  musl: string[];
}

const GNU_LOADER_PATHS_X64 = [
  "/lib64/ld-linux-x86-64.so.2",
  "/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
  "/lib/ld-linux-x86-64.so.2",
];

const GNU_LOADER_PATHS_ARM64 = [
  "/lib/ld-linux-aarch64.so.1",
  "/lib64/ld-linux-aarch64.so.1",
  "/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1",
];

const GNU_LOADER_PATHS_FALLBACK = [...GNU_LOADER_PATHS_X64, ...GNU_LOADER_PATHS_ARM64];

const MUSL_LOADER_PATHS_X64 = ["/lib/ld-musl-x86_64.so.1", "/usr/lib/ld-musl-x86_64.so.1"];

const MUSL_LOADER_PATHS_ARM64 = ["/lib/ld-musl-aarch64.so.1", "/usr/lib/ld-musl-aarch64.so.1"];

const MUSL_LOADER_PATHS_FALLBACK = [...MUSL_LOADER_PATHS_X64, ...MUSL_LOADER_PATHS_ARM64];

async function pathExists(filePath: string, fileSystem: Pick<IFileSystem, "exists">): Promise<boolean> {
  try {
    return await fileSystem.exists(filePath);
  } catch {
    return false;
  }
}

async function hasAnyPath(paths: string[], fileSystem: Pick<IFileSystem, "exists">): Promise<boolean> {
  for (const filePath of paths) {
    if (await pathExists(filePath, fileSystem)) {
      return true;
    }
  }

  return false;
}

function getLoaderPaths(arch: Architecture): ILoaderPaths {
  switch (arch) {
    case Architecture.X86_64:
      return { gnu: GNU_LOADER_PATHS_X64, musl: MUSL_LOADER_PATHS_X64 };
    case Architecture.Arm64:
      return { gnu: GNU_LOADER_PATHS_ARM64, musl: MUSL_LOADER_PATHS_ARM64 };
    default:
      return { gnu: GNU_LOADER_PATHS_FALLBACK, musl: MUSL_LOADER_PATHS_FALLBACK };
  }
}

export async function detectLibc(
  platform: Platform,
  arch: Architecture,
  dependencies: IDetectLibcDependencies,
): Promise<Libc> {
  if (platform !== Platform.Linux) {
    return Libc.Unknown;
  }

  const report = dependencies.getProcessReport?.();
  if (report?.header?.glibcVersionRuntime || report?.header?.glibcVersionCompiler) {
    return Libc.Gnu;
  }

  const { gnu, musl } = getLoaderPaths(arch);
  const [hasGnuLoader, hasMuslLoader] = await Promise.all([
    hasAnyPath(gnu, dependencies.fileSystem),
    hasAnyPath(musl, dependencies.fileSystem),
  ]);

  if (hasGnuLoader === hasMuslLoader) {
    return Libc.Unknown;
  }

  return hasGnuLoader ? Libc.Gnu : Libc.Musl;
}
