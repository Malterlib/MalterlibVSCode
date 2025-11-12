#!./.venv/bin/python3
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
    "scripts/generate_settings_from_theme.py",
    "scripts/combine_scopes.py",
    "scripts/convert_theme_to_srgb.py",
    "scripts/generate_theme_no_tokens.py",
    "scripts/generate_clangd_config.py",
    "scripts/generate_readme.py",
]

for script in SCRIPTS:
    print("\n==>", script)
    res = subprocess.run([sys.executable, script], cwd=ROOT)
    if res.returncode != 0:
        print(f"Script {script} failed", file=sys.stderr)
        sys.exit(res.returncode)
