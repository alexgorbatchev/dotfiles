--
-- https://github.com/nvimdev/nerdicons.nvim
--

return {
  {
    "nvimdev/nerdicons.nvim",
    opts = {
      down = "<C-j>",
      up = "<C-k>",
      copy = "<C-y>",
    },
    keys = {
      {
        "<leader>uz",
        function()
          vim.notify("<C-j> down, <C-k> up, <C-y> copy")
          require("nerdicons").instance()
        end,
        desc = "Nerd Icons",
      },
    },
  },
}
