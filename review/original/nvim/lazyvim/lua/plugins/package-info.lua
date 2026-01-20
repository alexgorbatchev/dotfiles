--
-- https://github.com/vuki656/package-info.nvim
--

---@type LazySpec[]
return {
  {
    "vuki656/package-info.nvim",
    dependencies = {
      "nvim-telescope/telescope.nvim",
    },
    config = function()
      require("package-info").setup()
      require("telescope").setup({
        extensions = {
          package_info = {
            initial_mode = "normal",
            layout_config = {
              width = 0.2,
              height = 0.2,
            },
          },
        },
      })
      require("telescope").load_extension("package_info")
    end,
    keys = {
      {
        "<leader>ct",
        function()
          require("telescope").extensions.package_info.package_info()
        end,
        desc = "package.json versions",
      },
    },
  },
}
