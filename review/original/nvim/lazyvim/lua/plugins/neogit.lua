--
-- https://github.com/NeogitOrg/neogit
--

return {
  {
    "NeogitOrg/neogit",
    dependencies = {
      "nvim-lua/plenary.nvim", -- required
      "sindrets/diffview.nvim", -- optional - Diff integration

      -- Only one of these is needed, not both.
      "nvim-telescope/telescope.nvim", -- optional
      -- "ibhagwan/fzf-lua", -- optional
    },
    config = true,
    opts = {
      signs = {
        section = { "󰬪 ", "󰬦 " },
        item = { "", "" },
        hunk = { "", "" },
      },
    },
    keys = {
      {
        "<leader>gn",
        function()
          require("neogit").open()
        end,
        desc = "Open Neogit",
      },
    },
  },
}
