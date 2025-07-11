#!./.venv/bin/python3
"""
Combine keywords.json, prefixmap.json, and classifications.json into a single scopes.json file for direct use in the extension.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEYWORDS = ROOT / "keywords.json"
PREFIXMAP = ROOT / "prefixmap.json"
CLASSIFICATIONS = ROOT / "classifications.json"
OUT_PATH = ROOT / "scopes.json"

with KEYWORDS.open("r", encoding="utf-8") as f:
    keywords_json = json.load(f)
with PREFIXMAP.open("r", encoding="utf-8") as f:
    prefixmap_json = json.load(f)
with CLASSIFICATIONS.open("r", encoding="utf-8") as f:
    classifications_json = json.load(f)

# Build keywords: keyword -> scope
keywords = {}
for k, v in keywords_json.items():
    if isinstance(v, dict):
        if v.get("example"):  # Exclude example keywords
            continue
        cls = v.get("classification")
    else:
        cls = v
    scope = classifications_json.get(cls)
    if scope:
        keywords[k] = scope

# Build prefixes: prefix -> {scope, variable}
prefixes = {}
for prefix, info in prefixmap_json.items():
    if isinstance(info, dict):
        cls = info.get("classification")
        variable = bool(info.get("variable"))
    else:
        cls = info
        variable = False
    scope = classifications_json.get(cls)
    if scope:
        prefixes[prefix] = {"scope": scope, "variable": variable}

# Build scopes (all unique scopes)
scopes_list = sorted(set(list(keywords.values()) + [v["scope"] for v in prefixes.values()]))

scopes = {
    "keywords": keywords,
    "prefixes": prefixes,
    "scopes": scopes_list
}

with OUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(scopes, f, indent=2)
    f.write("\n")

print(f"Wrote {OUT_PATH.relative_to(ROOT)} with {len(keywords)} keywords, {len(prefixes)} prefixes, {len(scopes_list)} unique scopes.") 