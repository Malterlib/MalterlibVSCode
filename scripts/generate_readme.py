#!./.venv/bin/python3
"""
Generate README.md from README-template.md, replacing {RecommendedSettings} with the contents of settings.json and {RecommendedSettingsSRGB} with the contents of settingsSRGB.json.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "README-template.md"
SETTINGS_PATH = ROOT / "settings.json"
SETTINGS_SRGB_PATH = ROOT / "settingsSRGB.json"
OUT_PATH = ROOT / "README.md"

with TEMPLATE_PATH.open("r", encoding="utf-8") as f:
    template = f.read()
with SETTINGS_PATH.open("r", encoding="utf-8") as f:
    settings = json.load(f)
with SETTINGS_SRGB_PATH.open("r", encoding="utf-8") as f:
    settings_srgb = json.load(f)

settings_str = json.dumps(settings, indent=2)
settings_srgb_str = json.dumps(settings_srgb, indent=2)

readme = template.replace("{RecommendedSettings}", settings_str)
readme = readme.replace("{RecommendedSettingsSRGB}", settings_srgb_str)

with OUT_PATH.open("w", encoding="utf-8") as f:
    f.write(readme)

print(f"Wrote {OUT_PATH.relative_to(ROOT)} with recommended settings from {SETTINGS_PATH.name} and {SETTINGS_SRGB_PATH.name}.") 