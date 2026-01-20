--
-- https://github.com/nvim-telescope/telescope-project.nvim
--

---@type LazySpec[]
return {
  {
    "nvim-telescope/telescope-project.nvim",
    dependencies = {
      "nvim-telescope/telescope.nvim",
    },
    init = function()
      require("telescope").setup({ sync_with_nvim_tree = true })
      require("telescope").load_extension("project")
    end,
    keys = {
      {
        "<leader>z",
        function()
          require("telescope").extensions.project.project({
            initial_mode = "normal",
            layout_config = {
              width = 0.5,
              height = 0.5,
            },
          })
        end,
        desc = "Workspaces",
      },
    },
  },
}
