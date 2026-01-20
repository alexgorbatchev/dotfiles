---@diagnostic disable: inject-field, undefined-field

--
-- Navigate your code with search labels, enhanced character motions and Treesitter integration 
-- https://github.com/folke/flash.nvim
--
return {
  {
    "folke/flash.nvim",
    event = "VeryLazy",
    ---@type Flash.Config
    opts = {
      prompt = { enabled = false },
      search = { multi_window = false },
      modes = {
        search = { enabled = false },
        char = { enabled = false },
      },
      label = {
        uppercase = false,
        after = false,
        before = { 0, 0 },
      },
    },
    keys = {
      {
        "s",
        function()
          local Flash = require("flash")

          -- for the first match
          ---@param opts Flash.Format
          local function format1(opts)
            return {
              { opts.match.label1, "FlashLabel" },
              { opts.match.label2, "FlashMatch" },
            }
          end

          -- for the second match
          ---@param opts Flash.Format
          local function format2(opts)
            return {
              { opts.match.label1, "FlashBackdrop" }, -- will be hidden
              { opts.match.label2, "FlashLabel" },
            }
          end

          Flash.jump({
            search = { mode = "search" },
            highlight = { matches = false },
            label = { format = format1 },
            ---@type fun(match:Flash.Match, state:Flash.State)|nil
            action = function(match, state)
              state:hide()
              Flash.jump({
                search = { max_length = 0 },
                highlight = { matches = false },
                label = { format = format2 },
                matcher = function(win)
                  -- limit matches to the current label
                  return vim.tbl_filter(function(m)
                    return m.label == match.label and m.win == win
                  end, state.results)
                end,
                labeler = function(matches)
                  for _, m in ipairs(matches) do
                    m.label = m.label2 -- use the second label
                  end
                end,
              })
            end,
            labeler = function(matches, state)
              local labels = state:labels()
              for index, match in ipairs(matches) do
                match.label1 = labels[math.floor((index - 1) / #labels) + 1]
                match.label2 = labels[(index - 1) % #labels + 1]
                match.label = match.label1 -- use the first label
              end
            end,
          })
        end,
        mode = { "n", "x", "o" },
        desc = "Flash",
      },
    },
  },
}
