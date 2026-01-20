--
-- https://github.com/rcarriga/nvim-dap-ui
--
return {
  {
    "rcarriga/nvim-dap-ui",
    dependencies = { "nvim-neotest/nvim-nio" },
    opts = {
      layouts = {
        {
          elements = {
            { id = "scopes", size = 0.25 },
            { id = "breakpoints", size = 0.25 },
            { id = "stacks", size = 0.25 },
            { id = "watches", size = 0.25 },
          },
          position = "left",
          size = 40,
        },
        {
          elements = {
            { id = "console", size = 1 },
          },
          position = "right",
          size = 100,
        },
        {
          elements = {
            { id = "repl", size = 1 },
          },
          position = "bottom",
          size = 10,
        },
      },
    },
    config = function(_, opts)
      local dap = require("dap")
      local dapui = require("dapui")
      dapui.setup(opts)
      dap.listeners.after.event_initialized["dapui_config"] = function()
        dapui.open({ reset = true })
      end
    end,
    keys = {
      {
        "<leader>du",
        function()
          require("dapui").toggle({ reset = true })
        end,
        desc = "Dap UI",
      },
      {
        "<leader>dy",
        function()
          local dapui = require("dapui")
          dapui.close()
          dapui.open({ reset = true })
        end,
        desc = "Reset Dap UI Windows",
      },
    },
  },
}
