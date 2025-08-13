# Color Themes

The Malterlib extension includes two meticulously crafted color themes designed specifically for Malterlib C++ development. Each theme is optimized for different display technologies and provides over 180 semantic token colors for precise code visualization.

## Overview

The Malterlib themes implement the [official Malterlib Coloring Standard](https://docs.malterlib.org/p__malterlib__core__code_standard__coloring.html) for VS Code. They are purpose-built for C++ development with Malterlib naming conventions and feature:

- **Semantic Color Coding**: 180+ distinct colors for different identifier types
- **Display Technology Optimization**: Separate themes for wide-gamut and standard displays
- **Complete Workbench Theming**: Editor, UI, terminal, and debug console colors
- **Accessibility Features**: WCAG AA contrast ratios and colorblind-friendly palette
- **Malterlib-Specific Highlighting**: Special handling for prefix-based naming conventions

## Theme Variants

### Malterlib Theme (Display P3)

**Optimized for**: Modern displays with wide color gamut support
- MacBook Pro (2016 and later)
- iMac with Retina display (2014 and later)
- iPad Pro
- High-end external monitors with P3 support
- Studio Display, Pro Display XDR

**Features**:
- **Extended Color Range**: Goes beyond sRGB to include more vivid, saturated colors
- **Enhanced Differentiation**: Better color separation for complex code structures
- **Reduced Eye Strain**: Optimized gamma and brightness for modern displays
- **Future-Proof**: Designed for the next generation of display technology

**When to Use**:
- You have a Display P3 capable monitor
- VS Code is running on macOS with wide color gamut support
- You want the most accurate and vivid color representation
- You're working in well-lit environments

**Note**: Upstream VS Code is currently hardcoded to sRGB. If you are using a standard VS Code release, prefer the `Malterlib (sRGB)` theme for accurate results. Automatic Display P3 color-space support is available in [Unbroken Code](https://github.com/Unbroken/UnbrokenCode.git).

### Malterlib Theme (sRGB)

**Optimized for**: Standard displays and maximum compatibility
- Most external monitors
- Older computers and laptops
- Mixed display environments
- Screen sharing and remote development
- Wide compatibility requirements

**Features**:
- **Universal Compatibility**: Works on all displays and systems
- **Consistent Colors**: Identical appearance across different devices
- **Perceptual Accuracy**: Carefully converted from P3 using ICC perceptual mapping
- **Standard Web Colors**: Uses standard sRGB color space

**When to Use**:
- You have a standard sRGB monitor
- Working in teams with mixed display setups
- Screen sharing or presenting code frequently
- Need guaranteed color consistency

**Note**: Upstream VS Code is currently hardcoded to sRGB. Use the `Malterlib (sRGB)` theme when running standard VS Code. Automatic sRGB handling and switching behavior for other color spaces are provided by [Unbroken Code](https://github.com/Unbroken/UnbrokenCode.git).

## Theme Installation and Configuration

### Installing Themes

The themes are automatically available when the Malterlib extension is installed. No separate installation is required.

### Switching Between Themes

#### Via Command Palette

1. Press `Cmd/Ctrl + Shift + P`
2. Type "Color Theme"
3. Select "Preferences: Color Theme"
4. Choose "Malterlib" or "Malterlib (sRGB)"

#### Via Settings

Add to your `settings.json`:
```json
{
    "workbench.colorTheme": "Malterlib"
}
```

Or for sRGB displays:
```json
{
    "workbench.colorTheme": "Malterlib (sRGB)"
}
```

#### Configuring VS Code Color Space

Important: Upstream VS Code does not currently support switching the editor's color space and defaults to sRGB. If you're running a standard VS Code release, select the `Malterlib (sRGB)` theme to ensure correct colors:

```json
{
    "workbench.colorTheme": "Malterlib (sRGB)"
}
```

Automatic color-space switching (for example to Display P3) is planned for the upcoming Unbroken Code release. For details see Unbroken Code: [Unbroken Code](https://github.com/Unbroken/UnbrokenCode.git).
