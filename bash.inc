#!/bin/bash

alias ll="ls -la"
alias l="ls -la"

whos-listening() {
  ps aux | grep "$(lsof -n -i4TCP:$0 | grep LISTEN)"
}

my-ips() {
  ifconfig | egrep "inet.*\d+.\d+.\d+.\d+" | awk '{print $2}'
}

h() {
  history | grep $1
}

function get-free-disk-space() {
  df -k / | tail -n 1 | awk '{ print $4 }'
}

function as-gb() {
  read num
  echo $(echo "scale=2;$num/1048576" | bc)Gi
}

