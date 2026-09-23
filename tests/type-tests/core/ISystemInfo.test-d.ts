import {
  Architecture,
  Libc,
  Platform,
  defineConfig,
  defineTool,
  type z_internal_ISystemInfo,
} from "@alexgorbatchev/dotfiles";
import { expectError, expectNotAssignable, expectType } from "tsd";

type SystemInfo = z_internal_ISystemInfo;

// The runtime hands every context `{ platform, arch, libc, homeDir, hostname }`, where
// `platform` and `arch` are the Platform and Architecture members of the target (as in
// v1), so a comparison against those constants is how a configuration branches on them.

const macosSystem: SystemInfo = {
  platform: Platform.MacOS,
  arch: Architecture.Arm64,
  libc: "unknown",
  homeDir: "/Users/example",
  hostname: "example-host",
};

expectType<Platform>(macosSystem.platform);
expectType<Architecture>(macosSystem.arch);
expectType<string>(macosSystem.libc);
expectType<string>(macosSystem.homeDir);
expectType<string>(macosSystem.hostname);

const isMacOS: boolean = macosSystem.platform === Platform.MacOS;
expectType<boolean>(isMacOS);
const isArm64: boolean = macosSystem.arch === Architecture.Arm64;
expectType<boolean>(isArm64);

// Neither holds the Go spelling of the target, so a string such as "arm64" or "darwin"
// is not a value of either: comparing one against them is a type error rather than a
// comparison that is silently never true.
expectNotAssignable<SystemInfo["arch"]>("arm64");
expectNotAssignable<SystemInfo["platform"]>("darwin");

// There is no `os` member: the operating system is `platform`.
expectError(macosSystem.os);

// libc values are the Libc enum's string values, so the enum compares directly.
const isMusl: boolean = macosSystem.libc === Libc.Musl;
expectType<boolean>(isMusl);
const isGnu: boolean = macosSystem.libc === Libc.Gnu;
expectType<boolean>(isGnu);

// The same shape reaches defineConfig and defineTool callbacks.
defineConfig(({ systemInfo }) => {
  expectType<SystemInfo>(systemInfo);
  return {};
});

defineTool((install, ctx) => {
  expectType<SystemInfo>(ctx.systemInfo);
  return install();
});

// An assetSelector, like every function-valued install parameter, receives it too.
defineTool((install) =>
  install("github-release", {
    repo: "matthart1983/syswatch",
    assetSelector: ({ assets, systemInfo }) => {
      expectType<SystemInfo>(systemInfo);
      const platformName = systemInfo.platform === Platform.MacOS ? "macos" : "linux";
      const archName = systemInfo.arch === Architecture.Arm64 ? "aarch64" : "x86_64";
      return assets.find((asset) => asset.name === `syswatch-${platformName}-${archName}.tar.gz`);
    },
  }),
);
