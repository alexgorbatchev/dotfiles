#!/bin/bash

green=`tput setaf 2`
reset=`tput sgr0`

alias gco="git checkout"
alias gm="gco master"
alias gl="git-log"
alias gbl="git-branch-list"
alias gbc="git-branch-create"
alias gbd="git-branch-describe"

git-show-in-master() {
  local filepath=`echo $1 | sed 's/^\///'`
  git show origin/master:$filepath
}

# shows the commit that added the file
git-what-added() {
  git log --diff-filter=A -- $*
}

git-set-local-author() {
  git config user.name "Alex Gorbatchev"
  git config user.email "alex.gorbatchev@gmail.com"
}

git-current-branch() {
  local branch_name=$(git symbolic-ref -q HEAD)
  branch_name=${branch_name##refs/heads/}
  branch_name=${branch_name:-HEAD}
  echo $branch_name
}

git-merge-master() {
  local current_branch="$(git-current-branch)"
  local stashed="$(git stash)"

  git checkout master
  git pull
  git checkout $current_branch
  git merge master

  if [[ "$stashed" != "No local changes to save" ]]; then
    git stash pop
  fi
}

git-rebase-master() {
  local current_branch="$(git-current-branch)"
  local stashed="$(git stash)"

  git checkout master
  git pull
  git checkout $current_branch
  git rebase master

  if [[ "$stashed" != "No local changes to save" ]]; then
    git stash pop
  fi
}

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
  local old_email="$1"
  local new_name="$2"
  local new_email="$3"

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

git-branch-create() {
  local branch="$1"
  local description="$2"

  git checkout -b $branch
  git-branch-describe $description
}

git-branch-current() {
  git rev-parse --abbrev-ref HEAD
}

git-branch-describe() {
  git config "branch.$(git-branch-current).description" $1
}

git-branch-list() {
  set -f
  git branch | while read line; do
    current="  "
    name=${line##\* }   ## removes leading * for current

    if [ ! "$name" = "$line" ]; then
      current="${green}* "
    fi

    description=`git config branch.$name.description`

    if [ "$description" != "" ]; then
      description=" : $description"
    fi

    echo "${reset}${current}${name}${description}"
  done
}
