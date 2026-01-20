--
-- This plugin adds horizontal highlights for text filetypes, like markdown, orgmode, and neorg. 
-- https://github.com/lukas-reineke/headlines.nvim
--
---@type LazySpec[]
return {
  {
    "lukas-reineke/headlines.nvim",
    enabled = false,
    event = "LazyFile",
    opts = {
      markdown = {
        headline_highlights = { "Constant" },
        fat_headline_upper_string = "",
        fat_headline_lower_string = "",
      },
    },
  },
}
