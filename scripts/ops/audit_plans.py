#!/usr/bin/env python3
"""Audit docs/plans - classify files, report issues, draft relocation map.

Usage:
  python scripts/ops/audit_plans.py --report
  python scripts/ops/audit_plans.py --report --relocation-map --count-links
  python scripts/ops/audit_plans.py --stdout

Writes (unless --stdout):
  docs/plans/PLANS_AUDIT_REPORT.md
  docs/plans/RELOCATION_MAP.md  (with --relocation-map)

Spec: docs/plans/PLANS_WORK_REGISTRY_SPEC.md
"""
from __future__ import annotations

import sys
from pathlib import Path

_OPS = Path(__file__).resolve().parent
if str(_OPS) not in sys.path:
    sys.path.insert(0, str(_OPS))

from plans_registry.cli_audit import main

if __name__ == "__main__":
    raise SystemExit(main())
