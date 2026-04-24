import { Platform, defineTool } from "@alexgorbatchev/dotfiles";
import { expectType } from "tsd";
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

  return {};
};

expectType<ConfigFactory>(configFactory);

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
