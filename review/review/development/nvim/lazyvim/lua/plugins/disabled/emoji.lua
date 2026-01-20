---@type LazySpec[]
return {
  {
    "allaman/emoji.nvim",
    event = "LazyFile",
    dependencies = {
      "nvim-telescope/telescope.nvim",
      {
        "hrsh7th/nvim-cmp",
        opts = function(opts)
          opts.sources = { { name = "emoji" } }
        end,
      },
    },
    opts = {
      enable_cmp_integration = true,
    },
    config = function(_, opts)
      require("emoji").setup(opts)
      require("telescope").load_extension("emoji")
    end,
    keys = {
      {
        "<leader>ce",
        function()
          require("telescope").extensions.emoji.emoji({
            layout_config = {
              width = 0.5,
              height = 0.5,
            },
          })
        end,
        desc = "Insert Emoji",
      },
    },
  },
}
