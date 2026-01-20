--
-- https://github.com/akinsho/bufferline.nvim
--

---@type LazySpec[]
return {
  {
    "akinsho/bufferline.nvim",
    version = "*",
    dependencies = "nvim-tree/nvim-web-devicons",
    opts = {
      options = {
        separator_style = "slant",
      },
    },
  },
}
