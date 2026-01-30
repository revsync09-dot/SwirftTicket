#!/usr/bin/env sh
set -e

python -m python.web &
python -m python.bot
