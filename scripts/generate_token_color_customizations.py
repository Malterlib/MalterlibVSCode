#!/usr/bin/env python3
"""
Generate a VS Code editor.tokenColorCustomizations JSON from colorexamples.json and the classification data files.
"""
import json
import pathlib
import re
import copy
try:
    import colour  # type: ignore
    HAVE_COLOUR = True
except ImportError:
    HAVE_COLOUR = False
    print("Warning: 'colour-science' not installed, sRGB conversion will be a no-op.")

ROOT = pathlib.Path(__file__).resolve().parents[1]
COLOR_EXAMPLES = ROOT / "colorexamples.json"
KEYWORDS = ROOT / "keywords.json"
PREFIXMAP = ROOT / "prefixmap.json"
CLASSIFICATIONS = ROOT / "classifications.json"
OUT_PATH = ROOT / "tokenColorCustomizations.json"

# Load all data
with COLOR_EXAMPLES.open("r", encoding="utf-8") as f:
    color_examples = json.load(f)
with KEYWORDS.open("r", encoding="utf-8") as f:
    keywordsJson = json.load(f)
with PREFIXMAP.open("r", encoding="utf-8") as f:
    prefixmap = json.load(f)
with CLASSIFICATIONS.open("r", encoding="utf-8") as f:
    classifications = json.load(f)

# --- Replicate C++/TS classifier logic for example -> scope matching ---
max_prefix_len = 6
valid_concept_chars = set('binpfro')

def is_upper_case(ch):
    if not ch:
        return False
    code = ord(ch)
    return (65 <= code <= 90) or (48 <= code <= 57) or (0xc0 <= code <= 0xdf)

def match_variable_prefix(identifier, prefix):
    if not identifier.startswith(prefix):
        return False
    match_len = len(prefix)
    ident_len = len(identifier)
    if ident_len <= match_len:
        return False
    ch = identifier[match_len:match_len+1]
    if ch and is_upper_case(ch):
        return True
    if ch and ch in valid_concept_chars:
        if ident_len <= match_len + 1:
            return False
        ch2 = identifier[match_len+1:match_len+2]
        if ch2 and is_upper_case(ch2):
            return True
        return False
    return False

def match_other_prefix(identifier, prefix):
    match_len = len(prefix)
    ident_len = len(identifier)
    if ident_len <= match_len:
        return False
    return identifier.startswith(prefix) and is_upper_case(identifier[match_len:match_len+1])

# Build prefix maps by length (variable and non-variable)
prefix_map_info_var = {i: {} for i in range(max_prefix_len+1)}
prefix_map_info = {i: {} for i in range(max_prefix_len+1)}
for prefix, info in prefixmap.items():
    if not isinstance(info, dict):
        continue
    classification = info.get('classification')
    is_var = bool(info.get('variable'))
    scope = classifications.get(classification)
    if not scope:
        continue
    l = len(prefix)
    if is_var:
        prefix_map_info_var[l][prefix] = scope
    else:
        prefix_map_info[l][prefix] = scope

# Build keywords (excluding those marked as example)
keywords = {}
for k, v in keywordsJson.items():
    if isinstance(v, dict):
        if v.get('example'):
            continue
        cls = v.get('classification')
    else:
        cls = v
    scope = classifications.get(cls)
    if scope:
        keywords[k] = scope

def classify_identifier(name):
    # 1. Exact keyword match
    if name in keywords:
        return keywords[name]
    # 2. Prefix match (longest first)
    n = len(name)
    for i in range(min(max_prefix_len, n), -1, -1):
        prefix = name[:i]
        # Non-variable
        if prefix in prefix_map_info[i]:
            if match_other_prefix(name, prefix):
                # Special case for E/CF
                if i == 1 and prefix == 'E' and '_' not in name:
                    return classifications.get('EClassification_Enum')
                if i == 2 and prefix == 'CF' and name.endswith('Ref'):
                    return classifications.get('EClassification_Type')
                return prefix_map_info[i][prefix]
        # Variable
        if prefix in prefix_map_info_var[i]:
            if match_variable_prefix(name, prefix):
                return prefix_map_info_var[i][prefix]
    return None

# Build semanticTokenColors rules
rules = []
covered_scopes = set()
scope_to_colors = {}
color_scope_pairs = set()
# Map (scope, color) -> list of examples
scope_color_to_examples = {}
for entry in color_examples:
    color = entry["color"]
    for example in entry["examples"]:
        scope = classify_identifier(example)
        if scope:
            scope_to_colors.setdefault(scope, set()).add(color)
            color_scope_pairs.add((scope, color))
            covered_scopes.add(scope)
            scope_color_to_examples.setdefault((scope, color), []).append(example)

# Remove conflicting scopes (those with >1 color)
conflicting = {scope for scope, colors in scope_to_colors.items() if len(colors) > 1}

# Only output rules for non-conflicting scopes
output_pairs = [(scope, next(iter(colors))) for scope, colors in scope_to_colors.items() if len(colors) == 1]
rules = [
    {"scope": scope, "settings": {"foreground": color}}
    for scope, color in output_pairs
]

discarded_pairs = [(scope, color) for scope, colors in scope_to_colors.items() if len(colors) > 1 for color in colors]

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        r, g, b = hex_color[:2], hex_color[2:4], hex_color[4:6]
        return [int(r, 16) / 255.0, int(g, 16) / 255.0, int(b, 16) / 255.0]
    raise ValueError(f"Invalid hex color: {hex_color}")

def rgb_to_hex(rgb):
    return '#{:02x}{:02x}{:02x}'.format(
        max(0, min(255, int(round(rgb[0] * 255)))),
        max(0, min(255, int(round(rgb[1] * 255)))),
        max(0, min(255, int(round(rgb[2] * 255))))
    )

def displayp3_hex_to_srgb_hex(hex_color):
    if not HAVE_COLOUR:
        return hex_color  # fallback: no conversion
    rgb = hex_to_rgb(hex_color)
    # Convert from Display P3 to XYZ, then to sRGB
    xyz = colour.models.RGB_to_XYZ(rgb, colour.models.RGB_COLOURSPACES['Display P3'])
    srgb = colour.models.XYZ_to_RGB(xyz, colour.models.RGB_COLOURSPACES['sRGB'])
    srgb = [max(0, min(1, c)) for c in srgb]
    return rgb_to_hex(srgb)

# Output JSON for editor.semanticTokenColorCustomizations (object form for settings.json)
result = {rule["scope"]: rule["settings"]["foreground"] for rule in rules}

# Also build sRGB-converted result
result_srgb = {scope: displayp3_hex_to_srgb_hex(color) for scope, color in result.items()}

# Output JSON for editor.semanticTokenColorCustomizations (object form for settings.json)
TEMPLATE_PATH = ROOT / "settingsTemplate.json"
with TEMPLATE_PATH.open("r", encoding="utf-8") as f:
    settings_template = json.load(f)
if not isinstance(settings_template, dict):
    print('settings_template:', settings_template)
    print('type:', type(settings_template))
    raise TypeError(f"settingsTemplate.json root must be a JSON object (dict), got {type(settings_template)}")

def convert_template_colors(obj, convert_func):
    if isinstance(obj, dict):
        new_obj = {}
        for k, v in obj.items():
            if k == "foreground" and isinstance(v, str) and v.startswith("#"):
                new_obj[k] = convert_func(v)
            else:
                new_obj[k] = convert_template_colors(v, convert_func)
        return new_obj
    elif isinstance(obj, list):
        return [convert_template_colors(item, convert_func) for item in obj]
    else:
        return obj

# Convert template for sRGB
settings_template_srgb = convert_template_colors(settings_template, displayp3_hex_to_srgb_hex)
if not isinstance(settings_template_srgb, dict):
    print('settings_template_srgb:', settings_template_srgb)
    print('type:', type(settings_template_srgb))
    raise TypeError(f"settings_template_srgb must be a dict, got {type(settings_template_srgb)}")

# Merge template and semanticTokenColorCustomizations
settings_obj = {}
for k, v in settings_template.items():
    settings_obj[k] = v
settings_obj["editor.semanticTokenColorCustomizations"] = {
    "enabled": True,
    "rules": result
}
settings_obj_srgb = {}
for k, v in settings_template_srgb.items():
    settings_obj_srgb[k] = v
settings_obj_srgb["editor.semanticTokenColorCustomizations"] = {
    "enabled": True,
    "rules": result_srgb
}

SETTINGS_PATH = ROOT / "settings.json"
SETTINGS_SRGB_PATH = ROOT / "settingsSRGB.json"
with SETTINGS_PATH.open("w", encoding="utf-8") as f:
    json.dump(settings_obj, f, indent=2)
    f.write("\n")
with SETTINGS_SRGB_PATH.open("w", encoding="utf-8") as f:
    json.dump(settings_obj_srgb, f, indent=2)
    f.write("\n")

print(f"Wrote {len(rules)} rules to {SETTINGS_PATH.relative_to(ROOT)} (settings.json)")
print(f"Wrote {len(rules)} rules to {SETTINGS_SRGB_PATH.relative_to(ROOT)} (settingsSRGB.json)")

# Report uncovered classifications
# Only include classifications referenced in keywords.json or prefixmap.json
referenced_classifications = set()
# Keep mapping from scope to prefixes and to keywords for reporting
scope_to_prefixes = {}
scope_to_keywords = {}
for k, v in keywordsJson.items():
    if isinstance(v, dict):
        cls = v.get("classification")
    else:
        cls = v
    scope = classifications.get(cls, cls) if cls else None
    if scope:
        referenced_classifications.add(scope)
        scope_to_keywords.setdefault(scope, []).append(k)
for prefix, v in prefixmap.items():
    if isinstance(v, dict):
        cls = v.get("classification")
    else:
        cls = v
    scope = classifications.get(cls, cls) if cls else None
    if scope:
        referenced_classifications.add(scope)
        scope_to_prefixes.setdefault(scope, []).append(prefix)

uncovered = sorted(referenced_classifications - covered_scopes)
if uncovered:
    print("\nUncovered classifications (scopes with no color rule, but referenced in keywords or prefixmap):")
    for scope in uncovered:
        print(f"  {scope}")
        if scope in scope_to_prefixes:
            print(f"    {scope_to_prefixes[scope]}")
        if scope in scope_to_keywords:
            print(f"    {scope_to_keywords[scope][0]}")
else:
    print("\nAll referenced classifications are covered by color rules.")

# Report scopes with multiple colors
if conflicting:
    print("\nScopes assigned multiple colors (no rule output for these):")
    for scope in sorted(conflicting):
        print(f"  {scope}: {sorted(scope_to_colors[scope])}")
        if scope in scope_to_prefixes:
            print(f"    {scope_to_prefixes[scope]}")
        if scope in scope_to_keywords:
            print(f"    {scope_to_keywords[scope][0]}")
else:
    print("\nNo scopes are assigned multiple colors.")

# Report discarded output pairs
if discarded_pairs:
    print("\nDiscarded scope/color pairs due to conflicts:")
    for scope, color in discarded_pairs:
        print(f"  {scope} / {color}")
        if scope in scope_to_prefixes:
            print(f"    {scope_to_prefixes[scope]}")
        if scope in scope_to_keywords:
            print(f"    {scope_to_keywords[scope][0]}")
        if (scope, color) in scope_color_to_examples:
            print(f"    Examples: {scope_color_to_examples[(scope, color)]}") 