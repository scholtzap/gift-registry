#!/usr/bin/env python3
"""Generate or verify docs/plans/PLANS_INDEX.md from YAML frontmatter.

Usage:
  python scripts/ops/refresh_plans_index.py --write
  python scripts/ops/refresh_plans_index.py --check   # CI

Spec: docs/plans/PLANS_WORK_REGISTRY_SPEC.md
"""
from __future__ import annotations

import sys
from pathlib import Path

_OPS = Path(__file__).resolve().parent
if str(_OPS) not in sys.path:
    sys.path.insert(0, str(_OPS))

from plans_registry.cli_refresh import main

if __name__ == "__main__":
    raise SystemExit(main())
