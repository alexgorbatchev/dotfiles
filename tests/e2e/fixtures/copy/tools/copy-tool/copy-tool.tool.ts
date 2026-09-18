import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install().copy("./config.toml", "~/.config/copy-tool/config.toml"));
