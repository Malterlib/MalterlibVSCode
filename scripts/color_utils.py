"""color_utils.py
Utility helpers for colour conversions used by conversion scripts.

Currently provides:
    • displayp3_hex_to_srgb_hex – perceptually maps a Display-P3 hex colour
      to sRGB using an ICC transform (Display P3 ➔ sRGB, perceptual intent)

Requirements: Pillow (with LittleCMS) must be available.
"""
from PIL import Image, ImageCms

# Paths to system ICC profiles on macOS. If they are missing the script will
# raise immediately, which is the desired behaviour for our usage.
P3_PROFILE_PATH = "/System/Library/ColorSync/Profiles/Display P3.icc"
SRGB_PROFILE_PATH = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"

P3_PROFILE = ImageCms.getOpenProfile(P3_PROFILE_PATH)
SRGB_PROFILE = ImageCms.getOpenProfile(SRGB_PROFILE_PATH)

# Build a single transform and reuse it for all colours.
TRANSFORM = ImageCms.buildTransformFromOpenProfiles(
    P3_PROFILE,
    SRGB_PROFILE,
    "RGB",
    "RGB",
    renderingIntent=ImageCms.Intent.PERCEPTUAL,
)


def displayp3_hex_to_srgb_hex(hex_color: str) -> str:
    """Convert a Display-P3 hex colour (e.g. "#ff00ff" or "#ff00ff80") to sRGB.

    Parameters
    ----------
    hex_color: str
        Hex string representing a colour in the Display-P3 colourspace
        (leading '#', 8-bit per channel). Supports both 6-character RGB
        and 8-character RGBA formats.

    Returns
    -------
    str
        Hex string for the perceptually-mapped colour in sRGB.
        Alpha channel (if present) is preserved unchanged.
    """
    # Remove leading '#', parse into integer 0–255 triplet.
    hex_str = hex_color.lstrip("#")

    # Check for alpha channel
    alpha_str = None
    if len(hex_str) == 8:
        # Extract alpha channel (last 2 characters)
        alpha_str = hex_str[6:8]
        hex_str = hex_str[0:6]
    elif len(hex_str) != 6:
        raise ValueError(f"Invalid hex colour: {hex_color}")

    rgb_int = tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4))

    # Build a 1×1 image in Display-P3 RGB and run the ICC transform.
    img_p3 = Image.new("RGB", (1, 1), rgb_int)
    img_srgb = ImageCms.applyTransform(img_p3, TRANSFORM)

    r, g, b = img_srgb.getpixel((0, 0))

    # Append alpha channel if it was present
    if alpha_str is not None:
        return f"#{r:02x}{g:02x}{b:02x}{alpha_str}"
    else:
        return f"#{r:02x}{g:02x}{b:02x}" 