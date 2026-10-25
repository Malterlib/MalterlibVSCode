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
RULES: List[Tuple[List[str], str]] = []  # (regexes, scope) – modifiers assigned later

# Malterlib's .editorconfig limits lines to 190 characters, and a rule's regex line is indented and quoted
MAX_LINE_LENGTH = 190
MAX_REGEX_LENGTH = MAX_LINE_LENGTH - len("      - regex: ''")

def alternation_regexes(alternatives: List[str]) -> List[str]:
    """Regexes that match one of the alternatives, split so that each fits on a line. Rules with the split regexes and
    the same modifiers match the same names as one rule with all alternatives."""
    regexes: List[str] = []
    chunk: List[str] = []

    def to_regex(parts: List[str]) -> str:
        joined = "|".join(parts)
        return rf"^({joined})$" if len(parts) > 1 else rf"^{joined}$"

    for alternative in alternatives:
        if chunk and len(to_regex(chunk + [alternative]).replace("'", "''")) > MAX_REGEX_LENGTH:
            regexes.append(to_regex(chunk))
            chunk = []
        chunk.append(alternative)
    if chunk:
        regexes.append(to_regex(chunk))
    return regexes

# 1. Exact keyword rules (grouped per scope) – highest precedence
scope_to_keywords: Dict[str, List[str]] = defaultdict(list)
for kw, scope in keywords.items():
    scope_to_keywords[scope].append(kw)

for scope, kw_list in sorted(scope_to_keywords.items()):
    RULES.append((alternation_regexes([re.escape(k) for k in sorted(kw_list)]), scope))

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
    RULES.append((alternation_regexes(stripped), scope))

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

FINAL_RULES: List[Tuple[List[str], List[str], str]] = []
for regexes, scope in RULES:
    mods = scope_to_mods_assigned.get(scope)
    if mods is None:
        mods = next(combo_iter)
        scope_to_mods_assigned[scope] = mods
    FINAL_RULES.append((regexes, mods, scope))

# ---------------------------------------------------------------------------
# Write .clangd YAML – use template if available
# ---------------------------------------------------------------------------
TEMPLATE_PATH = ROOT / ".clangd-template"

def build_rule_lines(regexes: List[str], mods: List[str], scope_comment: str, regex_indent: str = "      ",
                     add_indent: str = "        ") -> List[str]:
    lines: List[str] = []
    for regex in regexes:
        regex_yaml = regex.replace("'", "''")
        lines.append(f"{regex_indent}- regex: '{regex_yaml}'")
        lines.append(f"{add_indent}add: [{', '.join(mods)}]  # {scope_comment}")
    return lines

def build_rule_section(kinds: str, rules: List[Tuple[List[str], List[str], str]]) -> List[str]:
    lines: List[str] = [f"    {kinds}:"]
    for regexes, mods, scope in rules:
        lines.extend(build_rule_lines(regexes, mods, scope.replace('-', '.')))
    return lines

def is_keyword(scope: str) -> bool:
    return scope.startswith("malterlib-keyword-")

def is_macro(scope: str) -> bool:
    return scope == "malterlib-macro"

def build_generated_sections() -> List[str]:
    # Identifiers and keywords clangd gives no token (Unhighlighted) get all rules. Malterlib defines some keywords, such
    # as inline_always, as macros, which the extension colors as keywords, so macro tokens get the keyword rules, but
    # not the macro rules, as clangd knows they're macros. The tokens of names clangd knows but can't classify (Unknown),
    # such as dependent names, are neither keywords nor macros.
    # The macro rules precede the other prefix rules, which include the empty prefix of variables
    return (
        build_rule_section("Macro|Unhighlighted", [rule for rule in FINAL_RULES if is_keyword(rule[2])])
        + build_rule_section("Unhighlighted", [rule for rule in FINAL_RULES if is_macro(rule[2])])
        + build_rule_section(
            "Unknown|Unhighlighted", [rule for rule in FINAL_RULES if not is_keyword(rule[2]) and not is_macro(rule[2])]
        )
    )

if TEMPLATE_PATH.exists():
    template_lines = TEMPLATE_PATH.read_text(encoding="utf-8").splitlines()

    # Map scope -> list of (regex, mods) so we can pop as we consume
    from collections import defaultdict as _dd

    scope_to_remaining: Dict[str, List[Tuple[List[str], List[str]]]] = _dd(list)
    for regexes, mods, scope in FINAL_RULES:
        # The template's comments name the scopes in their TextMate form
        scope_to_remaining[scope.replace("-", ".")].append((regexes, mods))

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
                    regexes_val, mods_val = pair
                    # Build new regex and add lines preserving indentation
                    regex_indent = line[: line.index("- regex:")]
                    add_indent = add_line[: add_line.index("add:")]
                    output_lines.extend(build_rule_lines(regexes_val, mods_val, scope_tag, regex_indent, add_indent))
                    i += 2
                    continue  # Skip to next iteration
        # Default: copy line
        output_lines.append(line)
        i += 1

    # Always append the sections for macros, for names clangd can't classify and for identifiers it gives no token
    output_lines.extend(build_generated_sections())

    CLANGD_YAML.write_text("\n".join(output_lines) + "\n", encoding="utf-8")
    print(f"Wrote {CLANGD_YAML.relative_to(ROOT)} using template with {len(FINAL_RULES)} total rules for unhighlighted identifiers")
else:
    # Fallback to old autogenerated style
    clangd_lines: List[str] = ["SemanticTokens:", "  Rules:"] + build_generated_sections()

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