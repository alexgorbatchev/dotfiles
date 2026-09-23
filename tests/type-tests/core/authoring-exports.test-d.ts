import { Platform, defineConfig, defineTool } from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";
import type {
  ConfigFactory,
  IConfigContext,
  IInstallFunction,
  IPlatformConfigBuilder,
  IPlatformInstallFunction,
  IToolConfigBuilder,
  IToolConfigContext,
} from "@alexgorbatchev/dotfiles";

const configFactory: ConfigFactory = (ctx) => {
  expectType<IConfigContext>(ctx);

  return {
    features: {
      shellInstall: {
        zsh: "~/.zshrc",
      },
      catalog: {
        generate: true,
        filePath: "./CATALOG.md",
      },
    },
    paths: {
      homeDir: "/home/user",
    },
  };
};

expectType<ConfigFactory>(configFactory);

defineConfig(() => ({
  features: {
    shellInstall: {
      zsh: "~/.zshrc",
    },
  },
}));

// Invalid nested extra fields must be rejected by TypeScript
expectError(
  defineConfig(() => ({
    features: {
      features: {
        shellInstall: {
          zsh: "~/.zshrc",
        },
      },
    },
  })),
);

// Top-level unknown fields must be rejected by TypeScript
expectError(
  defineConfig(() => ({
    unknownTopLevel: true,
  })),
);

// Project-level platform overrides keep the v1 shape: os and/or arch from the fixed
// vocabularies, at least one matcher, and a partial configuration to fold in.
defineConfig(() => ({
  paths: { targetDir: "/usr/local/bin" },
  platform: [
    {
      match: [{ os: "macos", arch: "arm64" }],
      config: { paths: { targetDir: "/opt/homebrew/bin" } },
    },
    {
      match: [{ os: "linux" }, { arch: "x86_64" }],
      config: { system: { sudoPrompt: "sudo:" }, features: { shellInstall: { bash: "~/.bashrc" } } },
    },
  ],
}));

// The os values are macos/linux/windows. An unknown matcher key such as `platform` is
// not an error here: TypeScript does not report excess properties on a union-typed
// literal in a callback's return position. The loader rejects it at load time instead.
expectError(
  defineConfig(() => ({
    platform: [{ match: [{ os: "darwin" }], config: {} }],
  })),
);

// A matcher must name at least one of os and arch.
expectError(
  defineConfig(() => ({
    platform: [{ match: [{}], config: {} }],
  })),
);

// An override must carry at least one matcher.
expectError(
  defineConfig(() => ({
    platform: [{ match: [], config: {} }],
  })),
);

// The override config is limited to the base configuration sections.
expectError(
  defineConfig(() => ({
    platform: [{ match: [{ os: "macos" }], config: { platform: [] } }],
  })),
);

// Every cargo key the cargo installer reads.
defineConfig(() => ({
  cargo: {
    cratesIo: { host: "https://crates.io", token: "t", cache: { enabled: true, ttl: 86400000 } },
    githubRaw: { host: "https://raw.githubusercontent.com", token: "t", cache: { enabled: false, ttl: 1000 } },
    githubRelease: { host: "https://github.com", token: "t" },
    userAgent: "my-bot (me@example.com)",
  },
}));

// Archive downloads are cached by the downloader section, so the release host has no
// cache of its own.
expectError(
  defineConfig(() => ({
    cargo: { githubRelease: { cache: { enabled: false } } },
  })),
);

defineTool((install, ctx) => {
  expectType<IInstallFunction>(install);
  expectType<IToolConfigContext>(ctx);

  const builder: IToolConfigBuilder = install();

  builder.shell((shell) => {
    shell.env({ FOO: "bar" });
    shell.alias({ f: "foo" });
    shell.path("/custom/path");
  });

  return builder.platform(Platform.MacOS, (platformInstall) => {
    expectType<IPlatformInstallFunction>(platformInstall);

    const platformBuilder: IPlatformConfigBuilder = platformInstall();

    platformBuilder.shell((shell) => {
      shell.env({ PLATFORM_FOO: "bar" });
    });

    return platformBuilder;
  });
});
