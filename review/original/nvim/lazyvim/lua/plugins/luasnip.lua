local helpers = require("helpers")

local function find_vscode_snippets()
  local paths = {}
  local cwd = vim.fn.getcwd()

  while cwd ~= "/" do
    local vscode_dir = cwd .. "/.vscode"
    if vim.fn.isdirectory(vscode_dir) == 1 then
      local snippet_files = vim.fn.glob(vscode_dir .. "/*.code-snippets", false, true)
      for _, file in ipairs(snippet_files) do
        table.insert(paths, file)
      end
    end
    cwd = vim.fn.fnamemodify(cwd, ":h")
  end

  return paths
end

--
-- Make paths relative to CWD and show a notification
--
local function notify(paths)
  local relative_paths = {}
  local cwd = vim.fn.getcwd()

  for _, path in ipairs(paths) do
    table.insert(relative_paths, "- " .. helpers.path.relative(cwd, path))
  end

  if #relative_paths > 0 then
    vim.notify(vim.fn.getcwd() .. "\n\nFound snippets:\n\n" .. table.concat(relative_paths, "\n"), vim.log.levels.INFO)
  end
end

local function reload_luasnip_snippets()
  local paths = find_vscode_snippets()
  for _, path in ipairs(paths) do
    require("luasnip.loaders.from_vscode").load_standalone({
      path = path,
      override_priority = 10000,
    })
  end

  notify(paths)
end

return {
  {
    "L3MON4D3/LuaSnip",
    event = "LspAttach",
    config = function()
      reload_luasnip_snippets()
      vim.api.nvim_create_autocmd("DirChanged", { callback = reload_luasnip_snippets })
    end,
    keys = {
      {
        "<leader>xs",
        function()
          require("luasnip").log.open()
        end,
        desc = "LuaSnip: Logs Open",
      },
    },
  },
}
