#!./.venv/bin/python3
"""
Generate a theme based on malterlib.json but with tokenColors from Dark Modern.
Creates themes/malterlibNoTokens.json with Malterlib colors + Dark Modern tokens.
"""
import json
import json5
import pathlib

def main():
    # Define paths
    root = pathlib.Path(__file__).resolve().parents[1]
    input_path = root / "themes" / "malterlib.json"
    dark_modern_path = root / "darkModern.json"
    output_path = root / "themes" / "malterlibNoTokens.json"

    print(f"Generating theme with Dark Modern token colors from {input_path}...")

    # Read the malterlib theme file
    with open(input_path, 'r') as f:
        theme_data = json5.load(f)

    # Try to read Dark Modern theme for tokenColors
    token_colors = []
    if dark_modern_path.exists():
        try:
            with open(dark_modern_path, 'r') as f:
                dark_modern_data = json5.load(f)
                token_colors = dark_modern_data.get("tokenColors", [])
                print(f"Loaded {len(token_colors)} token colors from {dark_modern_path.name}")
        except Exception as e:
            print(f"Warning: Could not load Dark Modern theme: {e}")
            print("Theme will have no token colors (relying on semantic highlighting)")

    # Create new theme with Malterlib colors and Dark Modern tokenColors
    new_theme = {
        "$schema": theme_data.get("$schema"),
        "name": "Malterlib (Dark Modern Syntax)",
        "type": theme_data.get("type"),
        "semanticHighlighting": theme_data.get("semanticHighlighting"),
        "highlightingColorSpace": theme_data.get("highlightingColorSpace"),
        "colorSpace": theme_data.get("colorSpace"),
        "colors": theme_data.get("colors", {})
    }

    # Add tokenColors if we have them
    if token_colors:
        new_theme["tokenColors"] = token_colors

    # Write the new theme
    with open(output_path, 'w') as f:
        json.dump(new_theme, f, indent=4)

    print(f"✅ Theme saved to {output_path}")
    print(f"Colors section: {len(new_theme['colors'])} Malterlib color definitions")
    if token_colors:
        print(f"Token colors: {len(token_colors)} entries from Dark Modern")
    else:
        print(f"Token colors: none (relying on semantic highlighting only)")

if __name__ == "__main__":
    main()
