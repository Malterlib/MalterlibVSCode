#!/usr/bin/env python3
"""Convenience wrapper to refresh all generated artefacts (prefixmap, keywords,
classifications, grammar) and then run coverage verification.

Usage: python3 scripts/update_all.py
"""
import subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = [
    "scripts/parse_prefix_map.py",
    "scripts/generate_classifications.py",
    "scripts/extract_keywords.py",
    "scripts/generate_grammar.py",
    "scripts/generate_token_color_customizations.py",
    "scripts/combine_scopes.py",
    "scripts/generate_readme.py",
]

for script in SCRIPTS:
    print("\n==>", script)
    res = subprocess.run([sys.executable, script], cwd=ROOT)
    if res.returncode != 0:
        print(f"Script {script} failed", file=sys.stderr)
        sys.exit(res.returncode)

print("\n==> Running coverage check")
subprocess.run([sys.executable, "scripts/check_keywords_coverage.py"], cwd=ROOT) 