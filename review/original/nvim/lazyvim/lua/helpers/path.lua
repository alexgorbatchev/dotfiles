local M = {}

-- Function to split a path into its components
function M.split(path)
  local parts = {}
  for part in string.gmatch(path, "[^/\\]+") do
    table.insert(parts, part)
  end
  return parts
end

function M.basename(path)
  local parts = M.split(path)
  vim.notify(table.concat(parts, ","))
  return parts[#parts]
end

function M.parent(path)
  -- Remove the trailing slash if it exists
  path = path:gsub("/$", "")
  -- Match the parent path
  return path:match("^(.*)/") or ""
end

-- Function to resolve two absolute paths to a relative path
function M.relative(from, to)
  local from_components = M.split(from)
  local to_components = M.split(to)

  -- Find the common prefix
  local common_prefix_length = 0
  for i = 1, math.min(#from_components, #to_components) do
    if from_components[i] == to_components[i] then
      common_prefix_length = common_prefix_length + 1
    else
      break
    end
  end

  -- Build the relative path
  local relative_path = {}

  ---@diagnostic disable-next-line: unused-local
  for i = common_prefix_length + 1, #from_components do
    table.insert(relative_path, "..")
  end

  for i = common_prefix_length + 1, #to_components do
    table.insert(relative_path, to_components[i])
  end

  return table.concat(relative_path, "/")
end

return M
