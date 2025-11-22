#!./.venv/bin/python3
"""
Generate a theme based on malterlib.json but with tokenColors from Dark Modern.
Creates themes/malterlibNoTokens.json with Malterlib colors + Dark Modern tokens.
Token colors are converted from sRGB to Display P3 to match the theme's color space.
"""
import json
import json5
import pathlib
from color_utils import srgb_hex_to_displayp3_hex


def convert_token_colors_to_p3(token_colors):
    """Convert token colors from sRGB to Display P3.

    Parameters
    ----------
    token_colors : list
        List of token color entries from the Dark Modern theme (sRGB).

    Returns
    -------
    list
        Token color entries with colors converted to Display P3.
    """
    converted = []
    for entry in token_colors:
        converted_entry = entry.copy()
        settings = converted_entry.get("settings", {})

        # Convert foreground color if present
        if "foreground" in settings:
            try:
                settings["foreground"] = srgb_hex_to_displayp3_hex(settings["foreground"])
            except (ValueError, KeyError) as e:
                print(f"Warning: Could not convert foreground color '{settings['foreground']}': {e}")

        # Convert background color if present
        if "background" in settings:
            try:
                settings["background"] = srgb_hex_to_displayp3_hex(settings["background"])
            except (ValueError, KeyError) as e:
                print(f"Warning: Could not convert background color '{settings['background']}': {e}")

        converted_entry["settings"] = settings
        converted.append(converted_entry)

    return converted


def convert_semantic_token_colors_to_p3(semantic_token_colors):
    """Convert semantic token colors from sRGB to Display P3.

    Parameters
    ----------
    semantic_token_colors : dict
        Dictionary mapping token types to color strings (sRGB).

    Returns
    -------
    dict
        Token color dictionary with colors converted to Display P3.
    """
    converted = {}
    for token_type, color in semantic_token_colors.items():
        try:
            converted[token_type] = srgb_hex_to_displayp3_hex(color)
        except (ValueError, KeyError) as e:
            print(f"Warning: Could not convert semantic token color '{token_type}': '{color}': {e}")
            converted[token_type] = color  # Keep original on failure
    return converted


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

    # Try to read Dark Modern theme for tokenColors and semanticTokenColors
    token_colors = []
    semantic_token_colors = {}
    if dark_modern_path.exists():
        try:
            with open(dark_modern_path, 'r') as f:
                dark_modern_data = json5.load(f)
                token_colors = dark_modern_data.get("tokenColors", [])
                semantic_token_colors = dark_modern_data.get("semanticTokenColors", {})
                print(f"Loaded {len(token_colors)} token colors from {dark_modern_path.name}")
                print(f"Loaded {len(semantic_token_colors)} semantic token colors from {dark_modern_path.name}")
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

    # Convert hardcoded editor colors from sRGB to Display P3
    new_theme["colors"]["editor.background"] = srgb_hex_to_displayp3_hex("#1f1f1f")
    new_theme["colors"]["editor.foreground"] = srgb_hex_to_displayp3_hex("#cccccc")
    new_theme["colors"]["editorGutter.background"] = srgb_hex_to_displayp3_hex("#1f1f1f")

    # Add tokenColors if we have them (convert from sRGB to Display P3)
    if token_colors:
        print(f"Converting {len(token_colors)} token colors from sRGB to Display P3...")
        new_theme["tokenColors"] = convert_token_colors_to_p3(token_colors)

    # Add semanticTokenColors if we have them (convert from sRGB to Display P3)
    if semantic_token_colors:
        print(f"Converting {len(semantic_token_colors)} semantic token colors from sRGB to Display P3...")
        new_theme["semanticTokenColors"] = convert_semantic_token_colors_to_p3(semantic_token_colors)

    # Write the new theme
    with open(output_path, 'w') as f:
        json.dump(new_theme, f, indent=4)

    print(f"✅ Theme saved to {output_path}")
    print(f"Colors section: {len(new_theme['colors'])} Malterlib color definitions")
    if token_colors:
        print(f"Token colors: {len(token_colors)} entries from Dark Modern")
    else:
        print(f"Token colors: none (relying on semantic highlighting only)")
    if semantic_token_colors:
        print(f"Semantic token colors: {len(semantic_token_colors)} entries from Dark Modern")
    else:
        print(f"Semantic token colors: none")

if __name__ == "__main__":
    main()
