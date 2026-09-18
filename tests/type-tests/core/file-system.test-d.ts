import { defineTool } from "@alexgorbatchev/dotfiles";
import { expectError, expectType } from "tsd";

// IFileSystem declares exactly the operations the Go-backed runtime provides.
defineTool((install) =>
  install("manual").hook("after-install", async ({ fileSystem, installedDir }) => {
    const dir = `${installedDir}/share`;
    await fileSystem.mkdir(dir);
    await fileSystem.ensureDir(dir);
    await fileSystem.writeFile(`${dir}/config.toml`, 'theme = "dark"');
    const content: string = await fileSystem.readFile(`${dir}/config.toml`);
    expectType<string>(content);
    const exists: boolean = await fileSystem.exists(dir);
    expectType<boolean>(exists);
    await fileSystem.rename(`${dir}/config.toml`, `${dir}/config.bak`);
    await fileSystem.symlink(`${dir}/config.bak`, `${dir}/config.link`);
    await fileSystem.rm(dir);
  }),
);

// mkdir always creates parents; there is no options argument to ask for it.
expectError(
  defineTool((install) =>
    install("manual").hook("after-install", async ({ fileSystem }) => {
      await fileSystem.mkdir("/tmp/x", { recursive: true });
    }),
  ),
);

// Files are always UTF-8; an encoding argument is not accepted.
expectError(
  defineTool((install) =>
    install("manual").hook("after-install", async ({ fileSystem }) => {
      await fileSystem.readFile("/tmp/x", "utf8");
    }),
  ),
);

// There is no copy primitive on the file system; use rename, or the .copy() builder.
expectError(
  defineTool((install) =>
    install("manual").hook("after-install", async ({ fileSystem }) => {
      await fileSystem.copy("/tmp/a", "/tmp/b");
    }),
  ),
);
