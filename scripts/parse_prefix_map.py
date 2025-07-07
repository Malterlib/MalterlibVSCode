#!/usr/bin/env python3
"""Extract ms_PrefixMap entries (prefix, classification, variable?) from HighlighterrCxx.cpp.
Outputs prefixmap.json in workspace root.
"""
import pathlib, re, json, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CPP_PATH = ROOT.parent / "Highlighterr" / "HighlighterrCxx" / "HighlighterrCxx.cpp"
OUT_PATH = ROOT / "prefixmap.json"

if not CPP_PATH.exists():
    print(f"HighlighterrCxx.cpp not found at {CPP_PATH}", file=sys.stderr)
    sys.exit(1)

content = CPP_PATH.read_text(encoding="utf-8", errors="ignore")

# Regex for entries inside ms_PrefixMap array
pattern: str = r"\{\s*\"([^\"]*)\"\s*,\s*EClassification::(EClassification_[A-Za-z0-9_]+)\s*,\s*(true|false)\s*\}"
entry_re = re.compile(pattern)

matches = entry_re.findall(content)

prefix_map = {prefix: {"classification": cls, "variable": b == "true"} for prefix, cls, b in matches}

OUT_PATH.write_text(json.dumps(prefix_map, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"Wrote {len(prefix_map)} prefixes to {OUT_PATH.relative_to(ROOT)}") 