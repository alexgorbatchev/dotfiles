--
-- Provides Nerd Font icons (glyphs) for use by neovim plugins 
-- https://github.com/nvim-tree/nvim-web-devicons
--

---@type LazySpec[]
return {
  {
    "nvim-tree/nvim-web-devicons",
    opts = {
      override_by_extension = {
        ["zsh"] = {
          icon = "",
          color = "#428850",
          name = "Zsh",
        },
      },
    },
  },
}
