import { defineConfig } from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

defineConfig(() => ({ paths: { devToolsDir: "{paths.generatedDir}/dev-tools" } }));
expectError(defineConfig(() => ({ paths: { devToolsDir: false } })));
