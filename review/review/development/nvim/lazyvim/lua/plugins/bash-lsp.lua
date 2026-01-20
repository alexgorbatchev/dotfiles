--
-- https://github.com/bash-lsp/bash-language-server
--

---@type LazySpec[]
return {
  {
    "bash-lsp/bash-language-server",
    event = "LazyFile",
    build = "npm install -g bash-language-server",
    dependencies = {
      "neovim/nvim-lspconfig",
    },
    config = function()
      local lspconfig = require("lspconfig")

      lspconfig.bashls.setup({
        cmd = { "bash-language-server", "start" },
        filetypes = { "sh", "bash", "zsh" },
        root_dir = lspconfig.util.find_git_ancestor,
        settings = {
          bashIde = {
            globPattern = "*@(.sh|.inc|.bash|.zsh|.command)",
          },
        },
      })
    end,
  },
}
