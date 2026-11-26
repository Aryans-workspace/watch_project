#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
python main.py > error_log.txt 2>&1
