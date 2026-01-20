vim.opt.runtimepath:append("~/.local/share/nvim/site")

-- bootstrap lazy.nvim, LazyVim and your plugins
require("config.lazy")
require("config.autocmds")

local project_config = vim.fn.getcwd() .. "/nvim.lua"

if vim.fn.filereadable(project_config) == 1 then
  vim.notify("Using project config:\n" .. project_config)
  dofile(project_config)
end
