import { Libc, defineConfig, defineTool, type z_internal_ISystemInfo } from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";

type SystemInfo = z_internal_ISystemInfo;

// The runtime hands every context `{ os, arch, libc }` as plain strings (the values of
// `--platform`/`--arch`, or what the host reports), so that is what the type declares.

const macosSystem: SystemInfo = {
  os: "darwin",
  arch: "arm64",
  libc: "unknown",
};

expectType<string>(macosSystem.os);
expectType<string>(macosSystem.arch);
expectType<string>(macosSystem.libc);

// libc values are the Libc enum's string values, so the enum compares directly.
const isMusl: boolean = macosSystem.libc === Libc.Musl;
expectType<boolean>(isMusl);

// There is no `platform`, `homeDir` or `hostname` member; the docs point at
// `systemInfo.os` and `projectConfig.paths.homeDir` instead.
expectError(macosSystem.platform);
expectError(macosSystem.homeDir);
expectError(macosSystem.hostname);

// The same shape reaches defineConfig and defineTool callbacks.
defineConfig(({ systemInfo }) => {
  expectType<SystemInfo>(systemInfo);
  return {};
});

defineTool((install, ctx) => {
  expectType<SystemInfo>(ctx.systemInfo);
  return install();
});
