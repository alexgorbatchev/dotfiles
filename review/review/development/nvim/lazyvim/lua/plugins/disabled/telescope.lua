--
-- https://github.com/nvim-telescope/telescope.nvim
--

---@type LazySpec[]
return {
  {
    "nvim-telescope/telescope.nvim",
    keys = {
      {
        "<leader>cj",
        vim.schedule_wrap(function()
          require("telescope.builtin").treesitter({
            initial_mode = "normal",
            layout_config = {
              width = 0.5,
              height = 0.5,
            },
          })
        end),
        desc = "Go to symbol",
      },
    },
  },
}
