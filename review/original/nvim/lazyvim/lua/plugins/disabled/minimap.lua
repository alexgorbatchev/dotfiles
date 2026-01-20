--
-- https://github.com/wfxr/minimap.vim
--

-- Function to move the window with the specified filetype to the rightmost position
local function move_minimap_to_rightmost()
  -- Check if the window is floating
  local current_win = vim.api.nvim_get_current_win()
  local config = vim.api.nvim_win_get_config(current_win)

  -- don't do anything if current window is floating
  if config.relative ~= "" then
    return
  end

  local minimap_win = nil
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    local buf = vim.api.nvim_win_get_buf(win)
    local filetype = vim.api.nvim_get_option_value("filetype", { buf = buf })

    if filetype == "minimap" then
      minimap_win = win
      break
    end
  end

  -- If the window is found, move it to the rightmost position
  if minimap_win then
    -- Save the current window

    -- Move the window to the rightmost position
    vim.api.nvim_set_current_win(minimap_win)
    vim.cmd("wincmd L")

    -- Set the width of the minimap window
    vim.api.nvim_win_set_width(minimap_win, vim.g.minimap_width)

    -- Restore the original window
    vim.api.nvim_set_current_win(current_win)
  end
end

-- Autocommand to move the minimap window to the rightmost position
--vim.api.nvim_create_autocmd({ "WinEnter", "WinNew", "BufWinEnter", "VimResized" }, {
--vim.api.nvim_create_autocmd({ "WinNew" }, { callback = move_minimap_to_rightmost })

---@type LazySpec[]
return {
  {
    "wfxr/minimap.vim",
    event = "LazyFile",
    enabled = false,
    init = function()
      local g = vim.g

      g.minimap_width = 10
      g.minimap_auto_start = 1
      g.minimap_auto_start_win_enter = 1
      g.minimap_highlight_search = 1
      g.minimap_range_color = "CursorLine"
      g.minimap_cursor_color = "Cursor"
    end,
  },
}
