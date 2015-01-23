#!/bin/bash

alias ll="ls -la"
alias l="ls -la"

my-ips() {
  ifconfig | egrep "inet.*\d+.\d+.\d+.\d+" | awk '{print $2}'
}