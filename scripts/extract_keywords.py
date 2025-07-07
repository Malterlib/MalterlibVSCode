#!/usr/bin/env python3
"""Extract keywords from HighlighterrCxx.cpp f_AddDefaultKeyword_* calls (non-JS) and output keywords.json."""
import re, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CPP_PATH = ROOT / "Highlighterr" / "HighlighterrCxx" / "HighlighterrCxx.cpp"
OUTPUT_PATH = pathlib.Path(__file__).resolve().parents[1] / "keywords.json"

pattern = re.compile(r"f_AddDefaultKeyword_?(?:C|Cpp|CLike)?\(\s*\"([^\"]+)\"\s*,\s*EClassification::(EClassification_[A-Za-z0-9_]+)\s*\)")
pattern_js = re.compile(r"f_AddDefaultKeyword_JS\(")

# Storage for keywords
keywords = {}

# Regex for old style ignore("keyword", Classification, "whatever")
ignore_pattern = re.compile(
    r"ignore\s*\(\s*\"([^\"]+)\"\s*,\s*EClassification::(EClassification_[A-Za-z0-9_]+)\s*,")

# Regex for new style { "prefix", Classification, bool } ... ignore(example)
additional_ignore_pattern = re.compile(
    r"\{[^\n]*?EClassification::(EClassification_[A-Za-z0-9_]+)[^\n]*?\}[^\n]*?ignore\(\s*([A-Za-z0-9_]+)\s*\)")

# First pass: capture all ignore()-based examples and insert directly
with CPP_PATH.open(encoding="utf-8", errors="ignore") as f:
    for line in f:
        # Old style ignore("kw", Classification, ...)
        m_old = ignore_pattern.search(line)
        if m_old:
            kw, cls = m_old.groups()
            keywords[kw] = {"classification": cls, "example": True}
            continue

        # New style prefix-map entry with trailing ignore(keyword)
        m_new = additional_ignore_pattern.search(line)
        if m_new:
            cls, kw = m_new.groups()
            keywords[kw] = {"classification": cls, "example": True}

# Second pass: original extraction
with CPP_PATH.open(encoding="utf-8", errors="ignore") as f:
    for line in f:
        if pattern_js.search(line):
            continue  # skip JS keywords
        match = pattern.search(line)
        if match:
            kw, cls = match.groups()
            if kw in keywords:
                continue
            entry = {"classification": cls}
            if kw in keywords:
                entry["example"] = keywords[kw]["example"]
            keywords[kw] = entry

# write JSON
with OUTPUT_PATH.open("w", encoding="utf-8") as out:
    json.dump(keywords, out, indent=2, sort_keys=True)

print(f"Extracted {len(keywords)} keywords to {OUTPUT_PATH.relative_to(pathlib.Path.cwd())}") 