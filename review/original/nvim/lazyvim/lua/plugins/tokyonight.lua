--
-- https://github.com/folke/tokyonight.nvim
--

---@type LazySpec[]
return {
  {
    "folke/tokyonight.nvim",
    lazy = true,
    opts = {
      on_colors = function(colors)
        -- colors.hint = colors.orange
        -- colors.error = "#ff0000"
      end,
    },
  },
}
