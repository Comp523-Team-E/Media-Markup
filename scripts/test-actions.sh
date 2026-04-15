act pull_request \
  --container-architecture linux/amd64 \
  -P ubuntu-24.04=catthehacker/ubuntu:act-24.04 \
  -P ubuntu-24.04-arm=catthehacker/ubuntu:act-24.04 \
  -P macos-latest=catthehacker/ubuntu:act-24.04 \
  -P macos-13=catthehacker/ubuntu:act-24.04 \
  -P windows-latest=catthehacker/ubuntu:act-24.04 \
  --matrix runner:ubuntu-24.04 \
  -s GITHUB_TOKEN="$(gh auth token)"