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

git-branch-repos() {
  for repo in *; do 
    if [ -d $repo ]; then 
      echo "$repo [$yellow$(cd $repo; if [ -d .git ]; then git-current-branch; fi)$reset]"
    fi
  done
}

git-rebase-and-cherry-pick() {
  local branch=$1
  local sha=$2

  if [[ "$branch" == "" && "$sha" == "" ]]; then
    echo "Usage: $(basename "$0") [branch] [sha]"
    echo "    Recreates current branch from [branch] and cherry pick [sha] into it."
    return 1
  fi

  local current_branch=$(git-current-branch)
  git checkout $branch
  git branch -D $current_branch
  git checkout -b $current_branch
  git cherry-pick $sha
}

git-rebase-show-patch() {
  git show $(cat .git/rebase-apply/patch | head -n1)
}

git-rebase-show-conflict-in() {
  local branch=$1
  local pattern=$2

  if [[ "$branch" == "" ]]; then
    echo "Usage: $(basename "$0") [branch] [pattern]"
    echo "    During a rebase conflict, will display content of a CONFLICT file that"
    echo "    matches [pattern] from the [branch]. If [pattern] not provided, first"
    echo "    CONFLICT file will be displayed."
    return 1
  fi

  local file=$(git status -s | grep "^UU.*$pattern" | head -n1 | sed "s/^UU //")
  if [ "$file" == "" ]; then
    echo "Didn't match anything with $pattern"
    git status --short
    return 1
  fi
  git-show-in $branch $file
}

git-rebase-show-conflict-in-master() {
  git-rebase-show-conflict-in master $1
}

git-bulk() {
  local current_dir=$(pwd)

  for dir in `find . -maxdepth 2 -path "*/.git" -print 2>/dev/null`; do
    dir=`cd "${dir}/.."; pwd`
    echo "${yellow}${dir}${reset}"
    (
      for cmd in "$@"; do
        cd $dir && eval $cmd
      done
    )
  done
}

git-bulk-fix-author() {
  git-bulk "git-set-local-author" "git push -f"
}

git-bulk-pull() {
  git-bulk "git pull"
}

git-bulk-push() {
  git-bulk "git push"
}

git-bulk-push-f() {
  git-bulk "git push -f"
}

git-bulk-status() {
  git-bulk "git status"
}

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

git-show-in() {
  local git_root=`git rev-parse --show-toplevel`
  local branch="$1"
  local filepath=`echo $2 | sed s:^$git_root/::`

  if [[ "$branch" == "" && "$filepath" == "" ]]; then
    echo "Usage: $(basename "$0") [branch] [filepath]"
    echo "    Shows [file] content in the [branch]. [file] can start with a /
    echo "    that will be stripped away and treated as relative path to the
    echo "    current project."
    return 1
  fi

  git show origin/$branch:$filepath
}

git-show-in-master() {
  if [[ "$1" == "" ]]; then
    echo "Usage: $(basename "$0") [file]"
    echo "    Shows [file] content in master branch."
    return 1
  fi

  git-show-in master $1
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
  git rev-parse --abbrev-ref HEAD
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

git-branch-describe() {
  git config "branch.$(git-current-branch).description" $1
}

git-branch-list() {
  set -o noglob

  local current_branch=$(git-current-branch)
  local merged_branches=( )

  echo "$yellow✔ branches$reset are merged to $green> $current_branch"
  echo ""

  git branch --merged $current_branch | while read branch_name; do
    local branch_name=${branch_name##\* }

    if [[ "$branch_name" != "$current_branch" ]]; then
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
