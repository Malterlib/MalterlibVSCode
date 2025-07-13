#!./.venv/bin/python3
"""Generate a .clangd SemanticTokens configuration and matching VS Code
semanticScopesForPackage.json for the Malterlib highlighter.

The generated files are written to the repository root:
  • .clangd
  • semanticScopesForPackage.json

The rules replicate (approximately) the runtime classification logic found in
src/extension.ts – namely:
  1. Exact keyword matches.
  2. Prefix based matches (variable vs non-variable).  Longer prefixes have
     precedence.
  3. Two special-case prefixes handled in the TypeScript:
        – "E"  → enum (identifiers must not contain an underscore)
        – "CF" → CoreFoundation types that end with "Ref"

Each distinct Malterlib TextMate scope is assigned a *unique* set of modifiers
(Custom0 … Custom10).  Since 11 modifiers can encode 2¹¹ – 1 distinct sets,
this easily covers all existing scopes while satisfying clangd's requirement
that the *set* (not the individual modifier) be unique per rule.

Running the script:
    $ python3 scripts/generate_clangd_config.py
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Dict, List, Tuple
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCOPES_JSON = ROOT / "scopes.json"
CLANGD_YAML = ROOT / ".clangd"
SEMANTIC_SCOPES_JSON = ROOT / "semanticScopesForPackage.json"

if not SCOPES_JSON.exists():
    print(f"Error: {SCOPES_JSON} not found", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Load scopes.json (combined data used by the VS Code extension)
# ---------------------------------------------------------------------------
with SCOPES_JSON.open(encoding="utf-8") as fp:
    data = json.load(fp)

keywords: Dict[str, str] = data.get("keywords", {})  # identifier -> scope
prefixes: Dict[str, Dict[str, object]] = data.get("prefixes", {})

# Collect all distinct scope strings deterministically
prefix_scope_values: List[str] = [str(info.get("scope", "")) for info in prefixes.values()]
all_scopes: List[str] = sorted(set(list(keywords.values()) + prefix_scope_values))

# ---------------------------------------------------------------------------
# Helper: assign each unique scope a unique *set* of CustomX modifiers.
# ---------------------------------------------------------------------------
# Maximum number of modifiers that clangd currently supports (Custom0 … Custom8)
MAX_AVAILABLE_MODIFIERS = 9

# ---------------------------------------------------------------------------
# Determine the *minimal* number of modifiers required to uniquely encode the
# set of scopes.  With _m_ modifiers we can form (2^m − 1) non-empty unique
# sets, so we pick the smallest _m_ that satisfies that capacity.
# ---------------------------------------------------------------------------

num_scopes = len(all_scopes)
# Compute the minimal m such that (2**m - 1) >= num_scopes
required_modifiers = 0
while (1 << required_modifiers) - 1 < num_scopes:
    required_modifiers += 1

if required_modifiers > MAX_AVAILABLE_MODIFIERS:
    print(
        f"Error: {num_scopes} scopes exceed encoding capacity of {MAX_AVAILABLE_MODIFIERS} modifiers",
        file=sys.stderr,
    )
    sys.exit(1)

# We will only use Custom0 … Custom{required_modifiers-1}
USED_MODIFIERS = required_modifiers

# ---------------------------------------------------------------------------
# Build regex rules mirroring the TypeScript classifier logic (without mods yet).
# ---------------------------------------------------------------------------
RULES: List[Tuple[str, str]] = []  # (regex, scope) – modifiers assigned later

# 1. Exact keyword rules (grouped per scope) – highest precedence
scope_to_keywords: Dict[str, List[str]] = defaultdict(list)
for kw, scope in keywords.items():
    scope_to_keywords[scope].append(kw)

for scope, kw_list in sorted(scope_to_keywords.items()):
    kw_list_sorted = sorted(kw_list)
    joined = "|".join(re.escape(k) for k in kw_list_sorted)
    if '|' in joined:
        regex = rf"^({joined})$"
    else:
        regex = rf"^{joined}$"
    RULES.append((regex, scope))

# 2. Prefix rules – processed below and appended to RULES as they are generated

# Pre-computed character class for concept chars used by matchVariablePrefix in TS
CONCEPT_CHARS = "binpfro"
CONCEPT_CLASS = f"[{CONCEPT_CHARS}]"

# Group prefix regexes per scope for merging
scope_to_prefix_regexes: Dict[str, List[str]] = defaultdict(list)

PREFIX_ENTRIES = sorted(prefixes.items(), key=lambda kv: len(kv[0]), reverse=True)

for prefix, info in PREFIX_ENTRIES:
    variable = bool(info["variable"])  # type: ignore[index]
    default_scope = str(info.get("scope", ""))

    if prefix == "E":
        # Positive special-case: (enumerator scope from JSON)
        general_regex = r"^E[A-Z][A-Za-z0-9_]*_[A-Za-z0-9_]*$"
        scope_to_prefix_regexes[default_scope].append(general_regex)

        # General rule enum type (no underscore)
        enum_regex = r"^E[A-Z][A-Za-z0-9]*$"  # no underscore allowed
        scope_to_prefix_regexes["malterlib-enum"].append(enum_regex)
        continue

    if prefix == "CF":
        # Positive special-case: CoreFoundation type ending in Ref
        cf_type_regex = r"^CF[A-Z][A-Za-z0-9_]*Ref$"
        scope_to_prefix_regexes["malterlib-type"].append(cf_type_regex)

        # General CF rule (function scope from JSON)
        general_regex = r"^CF[A-Z][A-Za-z0-9_]*$"
        scope_to_prefix_regexes[default_scope].append(general_regex)
        continue

    escaped = re.escape(prefix)
    if variable:
        regex = rf"^{escaped}({CONCEPT_CLASS}?[A-Z][A-Za-z0-9_]*)$"
    else:
        regex = rf"^{escaped}[A-Z][A-Za-z0-9_]*$"

    scope_to_prefix_regexes[default_scope].append(regex)

# Combine and append to RULES list preserving scope insertion ordering
for scope, regex_list in scope_to_prefix_regexes.items():
    if not regex_list:
        continue
    stripped = [r[1:-1] if r.startswith("^") and r.endswith("$") else r for r in regex_list]
    joined = "|".join(stripped)
    if '|' in joined:
        combined_regex = rf"^({joined})$"
    else:
        combined_regex = rf"^{joined}$"
    RULES.append((combined_regex, scope))

# ---------------------------------------------------------------------------
# Assign modifier sets sequentially based on rule appearance.
# ---------------------------------------------------------------------------

# Generate the concrete modifier names that will actually be used
MOD_NAMES = [f"Custom{i}" for i in range(USED_MODIFIERS)]

from itertools import combinations

def modifier_combo_generator():
    """Yield unique modifier combinations (order-independent, no repeats):
    singles, then pairs, triples, etc. Each list is sorted.
    """
    for r in range(1, USED_MODIFIERS + 1):
        for combo in combinations(MOD_NAMES, r):
            yield list(combo)

# Assign mods per first appearance of scope
scope_to_mods_assigned: Dict[str, List[str]] = {}
combo_iter = modifier_combo_generator()

FINAL_RULES: List[Tuple[str, List[str], str]] = []
for regex, scope in RULES:
    mods = scope_to_mods_assigned.get(scope)
    if mods is None:
        mods = next(combo_iter)
        scope_to_mods_assigned[scope] = mods
    FINAL_RULES.append((regex, mods, scope))

# ---------------------------------------------------------------------------
# Write .clangd YAML – use template if available
# ---------------------------------------------------------------------------
TEMPLATE_PATH = ROOT / ".clangd-template"

def build_unknown_section(remaining_rules: List[Tuple[str, List[str], str]]) -> List[str]:
    unknown_lines: List[str] = ["    Unknown:"]
    for regex, mods, scope in remaining_rules:
        regex_yaml = regex.replace("'", "''")
        unknown_lines.append(f"      - regex: '{regex_yaml}'")
        scope_comment = scope.replace('-', '.')
        unknown_lines.append(f"        add: [{', '.join(mods)}]  # {scope_comment}")
    return unknown_lines

if TEMPLATE_PATH.exists():
    template_lines = TEMPLATE_PATH.read_text(encoding="utf-8").splitlines()

    # Map scope -> list of (regex, mods) so we can pop as we consume
    from collections import defaultdict as _dd

    scope_to_remaining: Dict[str, List[Tuple[str, List[str]]]] = _dd(list)
    for regex, mods, scope in FINAL_RULES:
        scope_to_remaining[scope].append((regex, mods))

    output_lines: List[str] = []
    i = 0
    while i < len(template_lines):
        line = template_lines[i]
        stripped = line.lstrip()
        if stripped.startswith("- regex:") and (i + 1) < len(template_lines):
            add_line = template_lines[i + 1]
            # Detect scope comment on add_line
            comment_match = re.search(r"#\s*([A-Za-z0-9_.-]+)", add_line)
            if comment_match:
                scope_tag = comment_match.group(1)
                # Fetch next (regex, mods) for this scope if available
                pair = None
                if scope_to_remaining.get(scope_tag):
                    pair = scope_to_remaining[scope_tag].pop(0)
                if pair:
                    regex_val, mods_val = pair
                    # Build new regex and add lines preserving indentation
                    regex_indent = line[: line.index("- regex:")]
                    regex_yaml = regex_val.replace("'", "''")
                    new_regex_line = f"{regex_indent}- regex: '{regex_yaml}'"

                    add_indent = add_line[: add_line.index("add:")]
                    mods_str = ", ".join(mods_val)
                    new_add_line = f"{add_indent}add: [{mods_str}]  # {scope_tag}"

                    output_lines.append(new_regex_line)
                    output_lines.append(new_add_line)
                    i += 2
                    continue  # Skip to next iteration
        # Default: copy line
        output_lines.append(line)
        i += 1

    # Always append an Unknown section containing *all* rules
    output_lines.extend(build_unknown_section([(r, m, s) for r, m, s in FINAL_RULES]))

    CLANGD_YAML.write_text("\n".join(output_lines) + "\n", encoding="utf-8")
    print(f"Wrote {CLANGD_YAML.relative_to(ROOT)} using template with {len(FINAL_RULES)} total rules in Unknown section")
else:
    # Fallback to old autogenerated style
    clangd_lines: List[str] = ["SemanticTokens:", "  Rules:", "    Unknown:"]
    for regex, mods, scope in FINAL_RULES:
        # YAML single quotes – escape existing single quotes by doubling
        regex_yaml = regex.replace("'", "''")
        clangd_lines.append(f"      - regex: '{regex_yaml}'")
        scope_comment = scope.replace('-', '.')
        clangd_lines.append(f"        add: [{', '.join(mods)}]  # {scope_comment}")

    CLANGD_YAML.write_text("\n".join(clangd_lines) + "\n", encoding="utf-8")
    print(f"Wrote {CLANGD_YAML.relative_to(ROOT)} with {len(FINAL_RULES)} rules (no template)")

# ---------------------------------------------------------------------------
# Write semanticScopesForPackage.json
# ---------------------------------------------------------------------------
selector_to_textmate: Dict[str, List[str]] = {}
for _, mods, scope in FINAL_RULES:
    selector = "*." + ".".join(m.lower() for m in mods)
    textmate_scope = scope.replace("-", ".")
    scopes_list = selector_to_textmate.setdefault(selector, [])
    if textmate_scope not in scopes_list:
        scopes_list.append(textmate_scope)

semantic_json = {
    "semanticTokenScopes": [
        {
            "language": "cpp",
            "scopes": selector_to_textmate,
        }
    ]
}

SEMANTIC_SCOPES_JSON.write_text(json.dumps(semantic_json, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {SEMANTIC_SCOPES_JSON.relative_to(ROOT)} with {len(selector_to_textmate)} selectors") 