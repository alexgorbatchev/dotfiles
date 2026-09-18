import { Libc, defineConfig, defineTool, type z_internal_ISystemInfo } from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";

type SystemInfo = z_internal_ISystemInfo;

// The runtime hands every context `{ os, arch, libc, homeDir, hostname }` as plain
// strings (the values of `--platform`/`--arch`, or what the host reports), so that is
// what the type declares.

const macosSystem: SystemInfo = {
  os: "darwin",
  arch: "arm64",
  libc: "unknown",
  homeDir: "/Users/example",
  hostname: "example-host",
};

expectType<string>(macosSystem.os);
expectType<string>(macosSystem.arch);
expectType<string>(macosSystem.libc);
expectType<string>(macosSystem.homeDir);
expectType<string>(macosSystem.hostname);

// libc values are the Libc enum's string values, so the enum compares directly.
const isMusl: boolean = macosSystem.libc === Libc.Musl;
expectType<boolean>(isMusl);
const isGnu: boolean = macosSystem.libc === Libc.Gnu;
expectType<boolean>(isGnu);

// There is no `platform` member: in this DSL `Platform` is the bitmask `.platform()`
// blocks take, so a string naming the operating system is `os` instead.
expectError(macosSystem.platform);

// The same shape reaches defineConfig and defineTool callbacks.
defineConfig(({ systemInfo }) => {
  expectType<SystemInfo>(systemInfo);
  return {};
});

defineTool((install, ctx) => {
  expectType<SystemInfo>(ctx.systemInfo);
  return install();
});
