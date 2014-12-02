source $HOME/.oh-my-zsh
source $HOME/.dotfiles/*.inc

export NVM_DIR="$HOME/.nvm"
export DOTFILES_DIR="$HOME/.dotfiles"

export PATH="$PATH:./node_modules/.bin"

[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$DOTFILES_DIR/local" ] && source $DOTFILES_DIR/local
