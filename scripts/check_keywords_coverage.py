#!/usr/bin/env python3
"""Check coverage of keywords.json entries by malterlib.tmLanguage.json regex patterns.

Usage: python3 scripts/check_keywords_coverage.py
Outputs a report of total keywords, matched, unmatched, and lists unmatched grouped by classification.
"""

import json
import re
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]  # workspace root
KEYWORDS_PATH = ROOT / "keywords.json"
GRAMMAR_PATH = ROOT / "syntaxes" / "malterlib.tmLanguage.json"

# Load data
with KEYWORDS_PATH.open("r", encoding="utf-8") as f:
    keywords_map = json.load(f)

with GRAMMAR_PATH.open("r", encoding="utf-8") as f:
    grammar = json.load(f)

patterns_raw = [p.get("match") for p in grammar.get("patterns", []) if "match" in p]
compiled_patterns = []
for pat in patterns_raw:
    try:
        # Anchor the pattern to ensure full identifier match
        compiled_patterns.append(re.compile(rf"^{pat}$"))
    except re.error as e:
        print(f"Failed to compile pattern '{pat}': {e}")

# Load classification->scope mapping
CLASS_PATH = ROOT / "classifications.json"
class_map = {}
if CLASS_PATH.exists():
    with CLASS_PATH.open("r", encoding="utf-8") as f:
        class_map = json.load(f)

unmatched_by_class = defaultdict(list)
matched_count = 0
multi_match_keywords = []
scope_mismatch = []

for keyword, val in keywords_map.items():
    if not keyword:
        continue

    if isinstance(val, str):
        classification = val
    elif isinstance(val, dict):
        classification = val.get("classification")
    else:
        continue

    matched_scope = None
    for idx, pat in enumerate(compiled_patterns):
        if pat.fullmatch(keyword):
            # Patterns now use captures instead of a top-level name
            pat_entry = grammar["patterns"][idx]
            matched_scope = pat_entry.get("name")
            if matched_scope is None:
                captures = pat_entry.get("captures", {})
                cap1 = captures.get("1") or captures.get(1)  # 1 may be int or str key
                if isinstance(cap1, dict):
                    matched_scope = cap1.get("name")
            break

    if matched_scope is None:
        unmatched_by_class[classification].append(keyword)
        continue

    matched_count += 1

    # Validate scope
    if class_map:
        expected_scope = class_map.get(classification)
        if expected_scope and matched_scope != expected_scope:
            scope_mismatch.append((keyword, classification, matched_scope, expected_scope))

# Report
total_keywords = len(keywords_map)
print(f"Total keywords: {total_keywords}")
print(f"Matched keywords: {matched_count}")
print(f"Unmatched keywords: {total_keywords - matched_count}\n")

for classification, words in unmatched_by_class.items():
    print(f"{classification} ({len(words)}):")
    # Show up to 20 words per classification to avoid overwhelming output
    sample = ', '.join(words[:20])
    print(f"  {sample}{' ...' if len(words) > 20 else ''}\n")

if scope_mismatch:
    print("\nScope mismatches:")
    for kw, cls, got, exp in scope_mismatch[:20]:
        print(f"  {kw}: expected {exp}, got {got}") 