--
-- https://github.com/mfussenegger/nvim-dap
-- https://github.com/mfussenegger/nvim-dap/blob/master/doc/dap.txt
--

local js_filetypes = {
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
}

local function js_debug()
  return vim.fn.resolve(vim.fn.stdpath("data") .. "/lazy/vscode-js-debug/out/src/dapDebugServer.js")
end

local function find_vscode_dir()
  local cwd = vim.fn.getcwd()

  while cwd ~= "/" do
    local vscode_dir = cwd .. "/.vscode"
    if vim.fn.isdirectory(vscode_dir) == 1 then
      return vscode_dir
    end
    cwd = vim.fn.fnamemodify(cwd, ":h")
  end

  return nil
end

local function find_vscode_workspace_dir()
  local vscode_dir = find_vscode_dir()
  if vscode_dir then
    return vim.fn.fnamemodify(vscode_dir, ":h")
  end
  return nil
end

---@type LazySpec[]
return {
  {
    "mfussenegger/nvim-dap",
    dependencies = {
      {
        "jbyuki/one-small-step-for-vimkind",
        keys = {
          {
            "<leader>dS",
            function()
              require("osv").launch({ port = 8086 })
            end,
            desc = "Launch OSV server",
          },
        },
      },
      -- Install the vscode-js-debug adapter
      {
        "microsoft/vscode-js-debug",
        version = "1.*",
        -- After install, build it and rename the dist directory to out
        build = "npm install --legacy-peer-deps --no-save && npx gulp vsDebugServerBundle && npx gulp dapDebugServer:webpack-bundle && mv dist out",
      },
      {
        "mxsdev/nvim-dap-vscode-js",
        config = function()
          ---@diagnostic disable-next-line: missing-fields
          require("dap-vscode-js").setup({
            debugger_path = js_debug(),
            adapters = { "pwa-node" },
          })
        end,
      },
      {
        "Joakker/lua-json5",
        build = "./install.sh",
      },
    },
    opts = function()
      local dap = require("dap")
      local vscode = require("dap.ext.vscode")

      ---@class dap.Adapter
      dap.adapters["pwa-node"] = {
        type = "server",
        host = "localhost",
        port = "${port}",
        executable = {
          command = "node",
          args = { js_debug(), "${port}" },
        },
      }

      -- config.program will have ${workspaceFolder} expanded to current nvim working directory,
      -- however we maybe using launch.json which would be in a different location relative
      -- to parent folder containing .vscode directory. So we need to adjust the program path
      -- to use vscode workspace root directory instead.
      dap.listeners.on_config["pwd-node"] = function(config)
        ---@class dap.Configuration
        local local_config = vim.deepcopy(config or {})
        local workspaceDir = find_vscode_workspace_dir()
        local needle = "${workspaceFolder}/"
        local program = local_config.program

        if workspaceDir and program and string.find(program, needle) then
          local_config.program = string.gsub(program, needle, workspaceDir .. "/")
        end

        return local_config
      end

      vscode.type_to_filetypes["pwa-node"] = js_filetypes
    end,
    keys = {
      {
        "<leader>da",
        function()
          local dap = require("dap")
          local vscode_dir = find_vscode_dir()
          local launch_json = vscode_dir .. "/launch.json"
          local cwd = vim.fn.getcwd()
          local configurations = {
            {
              type = "pwa-node",
              request = "launch",
              name = "Launch file",
              program = "${file}",
              cwd = "${workspaceFolder}",
            },
            {
              type = "pwa-node",
              request = "attach",
              name = "Attach",
              processId = require("dap.utils").pick_process,
              cwd = "${workspaceFolder}",
            },
          }

          if vim.fn.filereadable(launch_json) then
            require("dap.ext.vscode").load_launchjs(launch_json, { ["pwa-node"] = js_filetypes })

            table.insert(configurations, {
              -- name = "----- ↓ launch.json configs ↓ -----",
              name = "----- ↓ " .. require("helpers").path.relative(cwd, launch_json) .. " ↓ -----",
              type = "",
              request = "launch",
            })
          end

          for _, language in ipairs(js_filetypes) do
            dap.configurations[language] = configurations
          end

          require("dap").continue()
        end,
        desc = "Run with Args",
      },
    },
  },
}
