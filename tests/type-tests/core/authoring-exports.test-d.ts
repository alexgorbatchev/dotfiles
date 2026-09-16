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

defineTool((install, ctx) => {
  expectType<IInstallFunction>(install);
  expectType<IToolConfigContext>(ctx);

  const builder: IToolConfigBuilder = install();

  return builder.platform(Platform.MacOS, (platformInstall) => {
    expectType<IPlatformInstallFunction>(platformInstall);

    const platformBuilder: IPlatformConfigBuilder = platformInstall();

    return platformBuilder;
  });
});
