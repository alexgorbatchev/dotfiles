--
-- Quick switching between test, source and stories files.
-- https://github.com/rgroli/other.nvim
--

---@type LazySpec[]
return {
  {
    "rgroli/other.nvim",
    version = "*",
    event = "LazyFile",
    init = function()
      require("other-nvim").setup({
        rememberBuffers = false,
        showMissingFiles = false,
        mappings = {
          {
            pattern = "src/.*/([^.]+).(tsx?)$",
            target = {
              { target = "**/%1.test.%2", context = "test" },
              { target = "**/%1.stories.%2", context = "stories" },
            },
          },
          {
            pattern = "src/.*/([^.]+).test.(tsx?)$",
            target = {
              { target = "**/%1.%2", context = "source" },
              { target = "**/%1.stories.%2", context = "stories" },
            },
          },
          {
            pattern = "src/.*/([^.]+).stories.(tsx?)$",
            target = {
              { target = "**/%1.%2", context = "source" },
              { target = "**/%1.test.%2", context = "test" },
            },
          },
        },
      })
    end,
    keys = {
      {
        "<leader>cw",
        function()
          require("other-nvim").open()
        end,
        desc = "Switch to alternate file",
      },
    },
  },
}
