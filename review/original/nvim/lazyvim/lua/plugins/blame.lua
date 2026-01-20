--
-- https://github.com/FabijanZulj/blame.nvim
--
--
--
return {
  "FabijanZulj/blame.nvim",
  event = "VeryLazy",
  config = function()
    require("blame").setup()
  end,
}
