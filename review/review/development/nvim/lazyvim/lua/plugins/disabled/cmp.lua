--
-- A completion plugin for neovim coded in Lua.
-- https://github.com/hrsh7th/nvim-cmp
--

return {
  {
    "hrsh7th/nvim-cmp",

    ---@param opts cmp.ConfigSchema
    opts = function(_, opts)
      local cmp = require("cmp")

      -- Add borders to the completion and documentation windows
      opts.window = opts.window or {}
      opts.window.completion = cmp.config.window.bordered()
      opts.window.documentation = cmp.config.window.bordered()

      opts.sources = opts.sources or {}

      -- doesn't seem necessary?
      -- lazydev.nvim
      --table.insert(opts.sources, { name = "lazydev", group_index = 0 }) -- set group index to 0 to skip loading LuaLS completions

      opts.mapping = cmp.mapping.preset.insert({
        -- Default keybindings
        ["<C-b>"] = cmp.mapping.scroll_docs(-4),
        ["<C-f>"] = cmp.mapping.scroll_docs(4),
        ["<C-Space>"] = cmp.mapping.complete(),
        ["<Esc>"] = cmp.mapping.abort(),
        -- Remap <CR> to confirm completion to <Tab> to make typing easier
        ["<Tab>"] = cmp.mapping.confirm({ select = true }), -- Accept currently selected item. Set `select` to `false` to only confirm explicitly selected items.
      })
    end,
  },
}
