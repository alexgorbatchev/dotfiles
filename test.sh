(
  function goo() {
    eval echo "~/.nvmrc"
  }

  function foo() {
    (
      export HOME=/tmp/fakehome
      goo # <--- HOME should be /tmp/fakehome here
    )
  }

  foo
  goo # <--- HOME should be the original home here
)