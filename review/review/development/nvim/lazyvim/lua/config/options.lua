-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

local is_wsl = vim.fn.has("wsl") == 1

-- Adds border around diagnostics (<leader>cd)
vim.diagnostic.config({
  -- virtual_text = false, -- disable inline diagnostics
  float = { border = "rounded" },
})

-- Enable the option to require a Prettier config file
-- If no prettier config file is found, the formatter will not be used
vim.g.lazyvim_prettier_needs_config = true

vim.opt.conceallevel = 0

-- WSL Clipboard support
if is_wsl then
  -- This is NeoVim's recommended way to solve clipboard sharing if you use WSL
  -- See: https://github.com/neovim/neovim/wiki/FAQ#how-to-use-the-windows-clipboard-from-wsl
  vim.g.clipboard = {
    name = "WslClipboard",
    copy = {
      ["+"] = "clip.exe",
      ["*"] = "clip.exe",
    },
    paste = {
      ["+"] = 'powershell.exe -c [Console]::Out.Write($(Get-Clipboard -Raw).tostring().replace("`r", ""))',
      ["*"] = 'powershell.exe -c [Console]::Out.Write($(Get-Clipboard -Raw).tostring().replace("`r", ""))',
    },
    cache_enabled = 0,
  }
end
