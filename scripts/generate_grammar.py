#!/usr/bin/env python3
"""Generate syntaxes/malterlib.tmLanguage.json from prefixmap.json, keywords.json and classifications.json.

Usage: python3 scripts/generate_grammar.py
"""
import json, pathlib, re, sys
from collections import defaultdict
from scope_utils import classification_to_scope

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREFIX_PATH = ROOT / "prefixmap.json"
KEYWORDS_PATH = ROOT / "keywords.json"
GRAMMAR_OUT = ROOT / "syntaxes" / "malterlib.tmLanguage.json"

# Load data
prefix_map = json.loads(PREFIX_PATH.read_text()) if PREFIX_PATH.exists() else {}
keywords_data = json.loads(KEYWORDS_PATH.read_text()) if KEYWORDS_PATH.exists() else {}

# Build scope -> list[prefix]
prefix_entries = []  # list of tuples (prefix, scope, variable?)
for prefix, info in prefix_map.items():
    if isinstance(info, dict):
        cls = info["classification"]
        var_flag = info.get("variable", False)
    else:
        cls = info
        var_flag = False
    scope = classification_to_scope(cls)
    prefix_entries.append((prefix, scope, var_flag))

# Sort prefixes by length descending to mirror classifier precedence
prefix_entries.sort(key=lambda t: -len(t[0]))

# Build scope -> list[keyword]
keywords_by_scope = defaultdict(list)
for kw, val in keywords_data.items():
    if isinstance(val, str):
        cls = val
        is_example = False
    else:
        cls = val.get("classification")
        is_example = val.get("example", False)
    if is_example:
        continue
    if not cls:
        continue
    scope = classification_to_scope(cls)
    keywords_by_scope[scope].append(kw)

# Build keyword patterns first (higher precedence)
patterns = []
# Keywords
for scope, kw_list in keywords_by_scope.items():
    hash_keywords = [k for k in kw_list if k.startswith("#")]
    word_keywords = [k for k in kw_list if not k.startswith("#")]

    parts = []
    if word_keywords:
        escaped_words = [re.escape(k) for k in sorted(word_keywords, key=len, reverse=True)]
        parts.append(r"\b(?:" + "|".join(escaped_words) + r")\b")

    if hash_keywords:
        # Strip leading # for grouping
        escaped_hash = [re.escape(k[1:]) for k in sorted(hash_keywords, key=len, reverse=True)]
        parts.append(r"#(?:" + "|".join(escaped_hash) + r")\b")

    regex = "|".join(parts)
    patterns.append({
        "match": f"({regex})",
        "captures": {"1": {"name": scope}}
    })

# Then prefixes (one pattern per prefix, ordered by length)
for prefix, scope, _var in prefix_entries:
    escaped = re.escape(prefix)
    regex = rf"\b{escaped}[A-Za-z0-9_]+\b"
    patterns.append({
        "match": f"({regex})",
        "captures": {"1": {"name": scope}}
    })

# Note: Overall order now is: keywords first, then prefixes ordered by length. Do not resort.

grammar = {
    "scopeName": "malterlib.injection",
    "injectionSelector": "L:source.c -meta.preprocessor -string -comment, L:source.cpp -meta.preprocessor -string -comment",
    "patterns": patterns,
    "repository": {}
}

GRAMMAR_OUT.write_text(json.dumps(grammar, indent=2) + "\n", encoding="utf-8")
print(f"Generated {len(patterns)} patterns to {GRAMMAR_OUT.relative_to(ROOT)}") 