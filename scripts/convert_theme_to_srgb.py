#!./.venv/bin/python3
"""
Convert themes/malterlib.json from Display P3 to sRGB color space.
Creates themes/malterlibSRGB.json with converted colors.
"""
import json
import json5
import pathlib

# Import the utility function for colour conversion.
from color_utils import displayp3_hex_to_srgb_hex

def convert_colors_in_object(obj, convert_func, is_colors_object=False):
    """Recursively convert colors in an object"""
    if isinstance(obj, dict):
        new_obj = {}
        for k, v in obj.items():
            # Handle top-level "colors" object where values are color hex strings
            if is_colors_object and isinstance(v, str) and v.startswith("#"):
                new_obj[k] = convert_func(v)
            # Handle tokenColors where foreground/background are nested
            elif k in ["foreground", "background"] and isinstance(v, str) and v.startswith("#"):
                new_obj[k] = convert_func(v)
            # Special handling for the "colors" key itself
            elif k == "colors" and isinstance(v, dict):
                new_obj[k] = convert_colors_in_object(v, convert_func, is_colors_object=True)
            else:
                new_obj[k] = convert_colors_in_object(v, convert_func, is_colors_object=False)
        return new_obj
    elif isinstance(obj, list):
        return [convert_colors_in_object(item, convert_func, is_colors_object=False) for item in obj]
    else:
        return obj

def main():
    # Define paths
    root = pathlib.Path(__file__).resolve().parents[1]
    input_path = root / "themes" / "malterlib.json"
    output_path = root / "themes" / "malterlibSRGB.json"

    print(f"Converting {input_path} to sRGB...")

    # Read the theme file
    with open(input_path, 'r') as f:
        theme_data = json5.load(f)

    # Convert colors in the theme
    converted_theme = convert_colors_in_object(theme_data, displayp3_hex_to_srgb_hex)

    # Update the theme name and add color space info
    if isinstance(converted_theme, dict):
        converted_theme['name'] = 'Malterlib (sRGB)'
        converted_theme['type'] = 'dark'
        converted_theme['highlightingColorSpace'] = 'srgb'
        converted_theme['colorSpace'] = 'srgb'

    # Write the converted theme
    with open(output_path, 'w') as f:
        json.dump(converted_theme, f, indent=4)

    print(f"✅ Converted theme saved to {output_path}")

    # Report statistics
    original_colors = 0
    converted_colors = 0

    def count_colors(obj, is_colors_object=False):
        nonlocal original_colors, converted_colors
        if isinstance(obj, dict):
            for k, v in obj.items():
                # Count colors in top-level "colors" object
                if is_colors_object and isinstance(v, str) and v.startswith("#"):
                    original_colors += 1
                    converted_colors += 1
                # Count colors in tokenColors (foreground/background)
                elif k in ["foreground", "background"] and isinstance(v, str) and v.startswith("#"):
                    original_colors += 1
                    converted_colors += 1
                # Special handling for the "colors" key
                elif k == "colors" and isinstance(v, dict):
                    count_colors(v, is_colors_object=True)
                else:
                    count_colors(v, is_colors_object=False)
        elif isinstance(obj, list):
            for item in obj:
                count_colors(item, is_colors_object=False)

    count_colors(theme_data)

    print(f"Found {original_colors} colors in the theme")
    print(f"Converted {converted_colors} colors from Display P3 to sRGB using ICC perceptual mapping")

if __name__ == "__main__":
    main()
