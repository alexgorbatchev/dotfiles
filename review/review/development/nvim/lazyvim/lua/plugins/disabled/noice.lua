--
-- https://github.com/folke/noice.nvim
--
return {
  {
    "folke/noice.nvim",
    opts = {
      presets = {
        lsp_doc_border = true,
      },
      lsp = {
        hover = {
          -- Set not show a message if hover is not available
          -- ex: shift+k on TypeScript code
          silent = true,
        },
      },
    },
  },
}
