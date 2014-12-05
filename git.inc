#!/bin/bash

alias gco="git checkout"
alias gm="gco master"
alias gl="git-log"

git-log() {
  git log --pretty=format:"%Cgreen%h%Creset %ad %Cgreen%ae%Creset %s" --date=short $*
}

git-log-mine() {
  git-log --author="Alex Gorbatchev"
}

git-find-string() {
  git log --source --all -S '$1'
}

git-history-rewrite-author() {
  old_email="$1"
  new_name="$2"
  new_email="$3"

  filter="
    if [ \"\$GIT_COMMITTER_EMAIL\" = \"$old_email\" ]
    then
      export GIT_COMMITTER_NAME=\"$new_name\"
      export GIT_COMMITTER_EMAIL=\"$new_email\"
    fi

    if [ \"\$GIT_AUTHOR_EMAIL\" = \"$old_email\" ]
    then
      export GIT_AUTHOR_NAME=\"$new_name\"
      export GIT_AUTHOR_EMAIL=\"$new_email\"
    fi
  "

  git filter-branch -f --env-filter $filter --tag-name-filter cat -- --branches --tags
}