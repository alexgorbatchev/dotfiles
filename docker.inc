docker-machine-restart() {
  docker-machine restart default
  eval $(docker-machine env default)
}

docker-rm-all() {
  docker stop $(docker ps -a -q)
  docker rm $(docker ps -a -q)
}

