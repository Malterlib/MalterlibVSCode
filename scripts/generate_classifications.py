#!./.venv/bin/python3
"""Parse HighlighterrCxx.h to enumerate all EClassification values and map them to
malterlib TextMate scopes. Writes classifications.json in repo root.

Usage: python3 scripts/generate_classifications.py
"""
import pathlib, re, json, sys
from typing import List
from scope_utils import classification_to_scope

ROOT = pathlib.Path(__file__).resolve().parents[1]
HEADER_PATH = ROOT.parent / "Highlighterr" / "HighlighterrCxx" / "HighlighterrCxx.h"
OUTPUT_PATH = ROOT / "classifications.json"

if not HEADER_PATH.exists():
    print(f"Header file not found at {HEADER_PATH}.", file=sys.stderr)
    sys.exit(1)

source = HEADER_PATH.read_text(encoding="utf-8", errors="ignore")

# Extract enum block for EClassification
enum_pattern = re.compile(r"enum\s+class\s+EClassification\s*{([^}]+)}", re.S)
match = enum_pattern.search(source)
if not match:
    print("Could not locate EClassification enum in header.", file=sys.stderr)
    sys.exit(1)

body = match.group(1)
# Split by commas, strip comments and whitespace
entries: List[str] = []
for line in body.split(','):
    token = line.strip()
    if not token:
        continue
    # Remove trailing comment
    token = token.split('//')[0].strip()
    token = token.split('/*')[0].strip()
    if token:
        entries.append(token)

# Helper to map classification name -> scope; reuse logic from other scripts

# Use classification_to_scope from scope_utils for all mapping
mapping = {entry: classification_to_scope(entry) for entry in entries}

OUTPUT_PATH.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(mapping)} classifications to {OUTPUT_PATH.relative_to(ROOT)}") 