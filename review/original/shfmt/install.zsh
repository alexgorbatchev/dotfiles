#!/bin/bash

function install--shfmt() {
  zinit ice from=gh-r as=program \
    mv="shfmt_* -> shfmt"

  zinit load mvdan/sh

}
