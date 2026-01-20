--
-- https://github.com/nvim-neo-tree/neo-tree.nvim
--

return {
  {
    "nvim-neo-tree/neo-tree.nvim",
    dependencies = {
      "3rd/image.nvim",
    },
    opts = {
      filesystem = {
        window = {
          mappings = {
            ["<c-d>"] = "change_cwd",
          },
        },
      },
      commands = {
        change_cwd = function(state)
          local node = state.tree:get_node()

          if node and node.type == "directory" then
            vim.cmd("cd " .. node.path)
            vim.notify("Changed CWD to:\n" .. node.path)
          else
            vim.notify("Selected node is not a directory")
          end
        end,
      },
    },
  },
}
