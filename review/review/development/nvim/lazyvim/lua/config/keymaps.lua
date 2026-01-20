-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

local map = LazyVim.safe_keymap_set
local del = vim.keymap.del

map("n", "X", function()
  require("snacks")
  Snacks.bufdelete()
end, { desc = "Delete Buffer" })

-- add a map to call require("noice").cmd("history")
map("n", "<leader>h", function()
  require("noice").cmd("history")
end, { desc = "Noice History" })

-- Use `ga` for LSP actions
--map("n", "ga", LazyVim.lsp.action.source, { desc = "Source Action" })
-- del({ "n", "v" }, "<leader>ca")
-- del("n", "<leader>cA")
