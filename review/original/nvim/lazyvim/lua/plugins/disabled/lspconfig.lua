--
-- https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md
--
---@type LazySpec[]
return {
  {
    "neovim/nvim-lspconfig",
    event = "LazyFile",
    config = function()
      local lsp = require("lspconfig")
      lsp.lua_ls.setup({
        settings = {
          Lua = {
            diagnostics = {
              globals = { "vim", "use", "lazyvim" },
            },
          },
          telemetry = { enable = false },
        },
      })
    end,
    opts = {
      servers = {
        eslint = { format = false },
        denols = { enabled = false },
      },
      setup = {
        eslint = function()
          -- require("lazyvim.util").lsp.on_attach(function(client)
          --   if client.name == "eslint" then
          --     client.server_capabilities.documentFormattingProvider = true
          --   elseif client.name == "tsserver" then
          --     client.server_capabilities.documentFormattingProvider = false
          --   end
          -- end)
        end,
      },
    },
  },
}
