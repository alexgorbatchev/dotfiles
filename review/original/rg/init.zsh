#
# ripgrep recursively searches directories for a regex pattern while respecting your gitignore
# https://github.com/BurntSushi/ripgrep
#

# needs to be always available for icd to work correctly
zinit ice as=program from=gh-r \
  mv="ripgrep*/rg -> rg"

zinit light BurntSushi/ripgrep
