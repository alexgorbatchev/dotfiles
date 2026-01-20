-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua

vim.api.nvim_create_autocmd({ "BufLeave" }, {
  pattern = { "*" },
  command = "silent! wall",
  nested = true,
})

-- vim.cmd([[
--   autocmd TermEnter * setlocal guicursor=a:ver25
--   autocmd TermLeave * setlocal guicursor=n-v-c:block,i-ci-ve:ver25,r-cr-o:hor20
-- ]])

-- function Open_NeoTree()
--   require("neo-tree.command").execute({
--     toggle = true,
--     dir = vim.fn.getcwd(),
--   })

--   -- Focus on the right window
--   vim.defer_fn(function()
--     vim.cmd(vim.api.nvim_replace_termcodes("normal <C-l><Esc>", true, true, true))
--     vim.cmd(vim.api.nvim_replace_termcodes("normal <Esc>", true, true, true))
--   end, 300)
-- end

-- vim.cmd([[
--   " augroup ReopenNeoTreeAfterSessionLoad
--   "   autocmd!
--   "   autocmd SessionLoadPost * lua Open_NeoTree()
--   " augroup END

--   "
--   " Automatically save the buffer
--   "

--   " Define highlight groups for active and inactive windows
--   highlight InactiveWindow guibg=#212436
--   highlight ActiveWindow guibg=#1a1d2b

--   augroup WindowManagement
--     autocmd!
--     autocmd WinEnter * setlocal winhighlight=Normal:ActiveWindow,NormalNC:InactiveWindow
--   augroup END
-- ]])

-- Make window separator visibile
-- vim.api.nvim_set_hl(
--   -- global highlight group
--   0,
--   -- highlight group name
--   "WinSeparator",
--   {
--     fg = "gray",
--     bg = "#212436",
--     bold = true,
--   }
-- )
