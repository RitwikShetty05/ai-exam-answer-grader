#!/bin/bash
cd "$(dirname "$0")"
PYTHON=""
for candidate in "$GRADER_PYTHON" "/opt/anaconda3/envs/ml/bin/python" "$HOME/anaconda3/envs/ml/bin/python" "$HOME/miniconda3/envs/ml/bin/python" "/opt/homebrew/anaconda3/envs/ml/bin/python"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    PYTHON="$candidate"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  PYTHON="$(command -v python3)"
fi
"$PYTHON" launcher.py start
echo ""
echo "  You can close this window; the app keeps running."
