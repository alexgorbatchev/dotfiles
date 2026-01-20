--
-- Seach and replace across multiple files
-- https://github.com/nvim-pack/nvim-spectre
--

---@type LazySpec[]
return {
  {
    "nvim-pack/nvim-spectre",
    build = '[[ "$(uname)" == "Darwin" ]] && brew install gnu-sed',
    opts = {
      line_sep_start = "-----------------------------------------",
      result_padding = "   ",
      line_sep = "-----------------------------------------",
      highlight = {
        search = "DiffRemoved",
        replace = "DiffAdded",
      },
    },
  },
}
