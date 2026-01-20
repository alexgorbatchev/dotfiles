--
-- https://github.com/folke/lazydev.nvim
--

---@type LazySpec[]
return {
  {
    "folke/lazydev.nvim",
    event = "LazyFile",
    ft = { "lua" },
    opts = {
      library = {
        { "lazy.nvim", words = { "lazy", "LazySpec" } },
        { path = "luvit-meta/library", words = { "vim%.uv" } },
      },
    },
  },
}
