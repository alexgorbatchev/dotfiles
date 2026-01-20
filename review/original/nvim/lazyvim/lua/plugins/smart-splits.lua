--
-- Allows to resize windows easily
-- https://github.com/mrjones2014/smart-splits.nvim
--

---@type LazySpec[]
return {
  {
    "mrjones2014/smart-splits.nvim",
    -- not lazy as per the author's recommendation
    -- event = "LazyFile",
    keys = {
      {
        "<leader>wr",
        function()
          require("smart-splits").start_resize_mode()
        end,
        desc = "Resize windows",
        --icon = "",
      },
    },
  },
}
