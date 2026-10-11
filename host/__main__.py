"""Entry point: `python -m host <command>` (run from the MyLAN repo root, with host/.venv's Python)."""
import sys

from host.cli import main

sys.exit(main(sys.argv[1:]))
