#!./.venv/bin/python3
"""
Generate settings.json and settingsSRGB.json directly from the token color definitions
present in themes/malterlib.json.

For each rule in the theme's "tokenColors" array we copy it verbatim into
`editor.tokenColorCustomizations.textMateRules`.

Two settings files are emitted:
  • settings.json      – original Display-P3 colours
  • settingsSRGB.json  – sRGB-converted colours (fallback for displays / VS Code
    builds that do not support wide-gamut highlightingColorSpace).

The script is idempotent and intended to be invoked by update_all.py.
"""
from __future__ import annotations

import json
import pathlib
import copy
from typing import Any, Dict, List, cast

# External deps
try:
    import json5  # type: ignore
except ImportError as exc:
    raise RuntimeError(
        "This script requires the 'json5' package. Install it with 'pip install json5'."
    ) from exc

# Centralised colour conversion helper.
from color_utils import displayp3_hex_to_srgb_hex

ROOT = pathlib.Path(__file__).resolve().parents[1]
THEME_PATH = ROOT / "themes" / "malterlib.json"
TEMPLATE_PATH = ROOT / "settingsTemplate.json"
SETTINGS_PATH = ROOT / "settings.json"
SETTINGS_SRGB_PATH = ROOT / "settingsSRGB.json"

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def convert_template_colors(obj: Any, convert_func):  # type: ignore[override]
    """Recursively convert `foreground` values inside template object."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k == "foreground" and isinstance(v, str) and v.startswith("#"):
                out[k] = convert_func(v)
            else:
                out[k] = convert_template_colors(v, convert_func)
        return out
    if isinstance(obj, list):
        return [convert_template_colors(i, convert_func) for i in obj]
    return obj


def scope_dot_to_hyphen(scope: str) -> str:
    """Convert dot-separated scope to hyphen-separated variant."""
    return scope.replace(".", "-")


def copy_rule_with_converted_color(rule: Dict[str, Any], convert_func):
    new_rule = copy.deepcopy(rule)
    if "settings" in new_rule and isinstance(new_rule["settings"], dict):
        fg = new_rule["settings"].get("foreground")
        if isinstance(fg, str) and fg.startswith("#"):
            new_rule["settings"]["foreground"] = convert_func(fg)
    return new_rule

# ---------------------------------------------------------------------------
# Load theme + template
# ---------------------------------------------------------------------------

with THEME_PATH.open("r", encoding="utf-8") as f:
    raw_theme = f.read()

# JSON5 parsing is mandatory and trusted to handle comments/trailing commas
parsed = json5.loads(raw_theme)

if not isinstance(parsed, dict):
    raise TypeError("themes/malterlib.json must contain a JSON object at the root")

theme: Dict[str, Any] = parsed  # type: ignore[assignment]

token_colors: List[Dict[str, Any]] = theme.get("tokenColors", [])
if not token_colors:
    raise ValueError(f"No 'tokenColors' array found in {THEME_PATH}")

with TEMPLATE_PATH.open("r", encoding="utf-8") as f:
    settings_template: Dict[str, Any] = json.load(f)

# Validate template root object
if not isinstance(settings_template, dict):
    raise TypeError("settingsTemplate.json must contain a JSON object at the root")

# ---------------------------------------------------------------------------
# Build editor.tokenColorCustomizations.textMateRules
# ---------------------------------------------------------------------------

text_mate_rules_display: List[Dict[str, Any]] = token_colors  # type: ignore[assignment]

# Build sRGB-converted textMateRules
text_mate_rules_srgb: List[Dict[str, Any]] = [
    copy_rule_with_converted_color(rule, displayp3_hex_to_srgb_hex) for rule in token_colors
]

# ---------------------------------------------------------------------------
# Assemble final settings objects (semantic token customisations omitted – we
# rely on compatibility scopes).
# ---------------------------------------------------------------------------

# Display-P3 variant
settings_display: Dict[str, Any] = cast(Dict[str, Any], copy.deepcopy(settings_template))
settings_display["editor.tokenColorCustomizations"] = {
    "textMateRules": text_mate_rules_display
}

# sRGB variant – convert template colours too
settings_template_srgb = convert_template_colors(settings_template, displayp3_hex_to_srgb_hex)
settings_srgb: Dict[str, Any] = cast(Dict[str, Any], copy.deepcopy(settings_template_srgb))
settings_srgb["workbench.highlightingColorSpace"] = "srgb"
settings_srgb["editor.tokenColorCustomizations"] = {
    "textMateRules": text_mate_rules_srgb
}

# ---------------------------------------------------------------------------
# Write files
# ---------------------------------------------------------------------------

with SETTINGS_PATH.open("w", encoding="utf-8") as f:
    json.dump(settings_display, f, indent=2)
    f.write("\n")

with SETTINGS_SRGB_PATH.open("w", encoding="utf-8") as f:
    json.dump(settings_srgb, f, indent=2)
    f.write("\n")

print(
    f"Wrote {SETTINGS_PATH.relative_to(ROOT)} and {SETTINGS_SRGB_PATH.relative_to(ROOT)} "
    "based on colours from themes/malterlib.json."
) 