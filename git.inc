#!/bin/bash

green=`tput setaf 2`
yellow=`tput setaf 3`
reset=`tput sgr0`

alias gco="git checkout"
alias gm="gco master"
alias gl="git-log --no-merges"
alias glm="git-log"
alias gbl="git-branch-list"
alias gbc="git-branch-create"
alias gbd="git-branch-describe"

_git-with-stash() {
  set -x

  local current_branch="$(git-current-branch)"
  local stashed="$(git stash)"
  local has_stash

  if [[ "$stashed" != "No local changes to save" ]]; then
    local has_stash=TRUE
  fi

  if [ "$has_stash" == TRUE ]; then
    echo "Stashed changes"
  fi

  "$@"

  if [ "$has_stash" == TRUE ]; then
    git stash pop
  fi
}

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
  _git-with-stash _git-merge-master
}

_git-merge-master() {
  git checkout master
  git pull
  git checkout $current_branch
  git merge master
}

git-keep-up-to-date() {
  _git-with-stash _git-keep-up-to-date
}

_git-keep-up-to-date() {
  git pull
  _git-rebase-master
}

git-rebase-master() {
  _git-with-stash _git-rebase-master
}

_git-rebase-master() {
  git checkout master
  git pull
  git checkout $current_branch
  git rebase master
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
  set -o noglob

  local merged_branches=( )

  git branch --merged master | while read branch_name; do
    branch_name=${branch_name##\* }

    if [[ "$branch_name" != "master" ]]; then
      merged_branches+=("$branch_name")
    fi
  done

  git branch | while read branch_name; do
    local prefix="  "
    local color=$reset

    if [[ "$branch_name" == \** ]]; then
      color=$green
      prefix="> "
    fi

    branch_name=${branch_name##\* }

    if [[ ${merged_branches[*]} =~ "$branch_name" ]]; then
      prefix="✔ "
      color=$yellow
    fi

    description=`git config branch.$branch_name.description`

    if [[ "$description" != "" ]]; then
      description=" : $description"
    fi

    echo "${color}${prefix}${branch_name}${description}"
  done
}
