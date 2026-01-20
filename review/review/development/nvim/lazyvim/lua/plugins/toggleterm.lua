--
-- https://github.com/akinsho/toggleterm.nvim
-- https://github.com/LazyVim/LazyVim/discussions/193
--
return {
  {
    "akinsho/toggleterm.nvim",
    config = function()
      require("toggleterm").setup({
        open_mapping = [[<c-\>]],
      })
    end,
    keys = {
      mode = { "n", "v" },
      {
        "<leader>t",
        group = "terminal",
      },
      {
        "<leader>tv",
        function()
          local count = vim.v.count1
          local width = math.min(200, math.floor(vim.o.columns * 0.66))
          require("toggleterm").toggle(count, width, vim.fn.getcwd(), "vertical", "term")
        end,
        desc = "Terminal (vertical)",
      },
      {
        "<leader>th",
        function()
          local count = vim.v.count1
          local height = math.min(40, math.floor(vim.o.lines * 0.66))
          require("toggleterm").toggle(count, height, vim.fn.getcwd(), "horizontal", "term")
        end,
        desc = "Terminal (horizontal)",
      },
    },
  },
}
