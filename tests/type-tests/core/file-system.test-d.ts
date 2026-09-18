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
    await fileSystem.copyFile(`${dir}/config.bak`, `${dir}/config.copy`);
    await fileSystem.chmod(`${dir}/config.copy`, 0o755);
    const target: string = await fileSystem.readlink(`${dir}/config.link`);
    expectType<string>(target);
    await fileSystem.rmdir(dir);
    await fileSystem.rm(dir);
  }),
);

// stat follows a symbolic link, lstat describes the link itself.
defineTool((install) =>
  install("manual").hook("after-install", async ({ fileSystem, installedDir }) => {
    const stats = await fileSystem.stat(installedDir ?? "");
    expectType<boolean>(stats.isFile);
    expectType<boolean>(stats.isDirectory);
    expectType<boolean>(stats.isSymbolicLink);
    expectType<number>(stats.mode);
    expectType<number>(stats.size);

    const linkStats = await fileSystem.lstat(installedDir ?? "");
    expectType<boolean>(linkStats.isSymbolicLink);
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

// The copy primitive is named after the POSIX call it performs, as in v1; `copy` is
// the builder method that copies a file into the generated tree.
expectError(
  defineTool((install) =>
    install("manual").hook("after-install", async ({ fileSystem }) => {
      await fileSystem.copy("/tmp/a", "/tmp/b");
    }),
  ),
);

// rmdir takes no recursive option: removing a populated tree is what rm is for.
expectError(
  defineTool((install) =>
    install("manual").hook("after-install", async ({ fileSystem }) => {
      await fileSystem.rmdir("/tmp/x", { recursive: true });
    }),
  ),
);
