--
-- https://github.com/smoka7/multicursors.nvim
--

-- Function to copy highlight group properties
local function copy_highlight(src, dest)
  -- Retrieve the highlight properties of the source group
  local src_hl = vim.api.nvim_get_hl(0, { name = src, link = false })

  -- Apply the highlight properties to the destination group
  ---@diagnostic disable-next-line
  vim.api.nvim_set_hl(0, dest, src_hl)
end

---@type LazySpec[]
return {
  {
    "smoka7/multicursors.nvim",
    event = "VeryLazy",
    dependencies = {
      "nvimtools/hydra.nvim",
    },
    opts = {},
    init = function()
      copy_highlight("Cursor", "MultiCursor")
      copy_highlight("Cursor", "MultiCursorMain")
    end,
    cmd = { "MCstart", "MCvisual", "MCclear", "MCpattern", "MCvisualPattern", "MCunderCursor" },
    keys = {
      {
        mode = { "v", "n" },
        "<C-d>",
        "<cmd>MCstart<cr>",
        desc = "Create a selection for selected text or word under the cursor",
      },
    },
  },
}
