docker-machine-restart() {
  docker-machine restart default
  eval $(docker-machine env default)
}

docker-rm-all() {
  docker stop $(docker ps -a -q)
  docker rm $(docker ps -a -q)
}

docker-images-grep() {
  docker images | grep $1 | awk {'print $3'} | sort | uniq
}

docker-rmi-grep() {
  docker rmi --force $(docker-images-grep $1)
}

docker-rmi-untagged() {
  docker rmi $(docker images | grep "^<none>" | awk "{print $3}")
}
