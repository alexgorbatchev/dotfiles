--
-- https://github.com/LukasPietzschmann/telescope-tabs
--

---@type LazySpec[]
return {
  {
    "LukasPietzschmann/telescope-tabs",
    dependencies = {
      "nvim-telescope/telescope.nvim",
    },
    config = function()
      require("telescope").load_extension("telescope-tabs")
      require("telescope-tabs").setup({})
    end,
    keys = {
      {
        "<leader><tab>t",
        vim.schedule_wrap(function()
          require("telescope-tabs").list_tabs({
            initial_mode = "normal",
            layout_config = {
              width = 0.5,
              height = 0.5,
            },
          })
        end),
        desc = "Telescope Tabs",
      },
    },
  },
}
