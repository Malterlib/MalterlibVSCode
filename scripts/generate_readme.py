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
CLANGD_PATH = ROOT / ".clangd"
OUT_PATH = ROOT / "README.md"

with TEMPLATE_PATH.open("r", encoding="utf-8") as f:
    template = f.read()
with SETTINGS_PATH.open("r", encoding="utf-8") as f:
    settings = json.load(f)
with SETTINGS_SRGB_PATH.open("r", encoding="utf-8") as f:
    settings_srgb = json.load(f)

# .clangd may not exist yet; handle gracefully
clangd_content = ""
if CLANGD_PATH.exists():
    clangd_content = CLANGD_PATH.read_text(encoding="utf-8")
else:
    placeholder = "{RecommendedClangD}"
    print(f"Warning: {CLANGD_PATH.relative_to(ROOT)} not found; {placeholder} placeholder will be empty.")

settings_str = json.dumps(settings, indent=2)
settings_srgb_str = json.dumps(settings_srgb, indent=2)

def filter_indented_lines(s):
    return "\n".join(line for line in s.splitlines() if line.startswith("  "))

settings_str_indented = filter_indented_lines(settings_str)
settings_srgb_str_indented = filter_indented_lines(settings_srgb_str)

readme = template.replace("{RecommendedSettings}", settings_str_indented)
readme = readme.replace("{RecommendedSettingsSRGB}", settings_srgb_str_indented)
readme = readme.replace("{RecommendedClangD}", clangd_content.strip())

with OUT_PATH.open("w", encoding="utf-8") as f:
    f.write(readme)

print(f"Wrote {OUT_PATH.relative_to(ROOT)} with recommended settings from {SETTINGS_PATH.name} and {SETTINGS_SRGB_PATH.name}.") 