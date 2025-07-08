#!/usr/bin/env bash

docker run -p 6333:6333 \
  -v "$(pwd)/.qdrant/data:/qdrant/storage" \
  -v "$(pwd)/.qdrant/snapshots:/qdrant/snapshots" \
  -e QDRANT__SERVICE__API_KEY=apikey \
  -d \
  qdrant/qdrant

# -v $(pwd)/.qdrant/custom_config.yaml:/qdrant/config/production.yaml \
