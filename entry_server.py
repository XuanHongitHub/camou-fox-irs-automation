import os
import sys

# Ensure UTF-8 and line buffering on stdout/stderr for PyInstaller pipes
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)
except Exception:
    pass

import multiprocessing

# Support hot-patching from %APPDATA%/bug-auto/patches
_patch_dir = os.path.expandvars(r'%APPDATA%\bug-auto\patches')
if os.path.isdir(_patch_dir) and _patch_dir not in sys.path:
    sys.path.insert(0, _patch_dir)

# Ensure project root is in sys.path
_root = os.path.dirname(os.path.abspath(__file__))
if _root not in sys.path:
    sys.path.insert(0, _root)

from irs_bot.cli import main

if __name__ == '__main__':
    multiprocessing.freeze_support()
    if any(arg.startswith("parent_pid=") or "multiprocessing-fork" in arg for arg in sys.argv[1:]):
        sys.exit(0)
    main()
