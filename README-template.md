# Malterlib Syntax Coloring README

## Features

* Syntaxt highlighting for Malterlib C++ and build files
* Try to mimic the Malterlib coloring semantics for other file types

---

## Configuration

### Manual Configuration

If you are not using the Malterlib theme you can use your theme of choice and enable instead configure the highlighting colors in your settings.json.

---
Here are the recommmended colors:

<details><summary>Recommended Settings</summary>
    
```json
{RecommendedSettings}
```
</details>

If you have a Visual Studio Code that doesn't support changing color space (or if you prefer sRGB):
<details><summary>Recommended Settings (sRGB)</summary>

```json
{RecommendedSettingsSRGB}
```
</details>

---

### Configuration of clangd

When using clangd shipped with Malterlib you can use the following .clangd configuration fragment to enable 
syntax coloring of Malterlib identifiers:
<details><summary>Recommended .clangd</summary>
    
```yaml
{RecommendedClangD}
```
</details>

---

## Release Notes

### 1.0.0

* Initial release of Malterlib VSCode

### 1.0.1

* Add support for Malterlib Build highlighting

### 1.0.2

* Highlight scope bug fixes

### 1.0.3

* Add support for Display P3 color space

### 1.0.4

* Remove the extension to Malterlib only
* Add Malterlib and Malterlib (sRGB) themes
* Add support for clangd formatting
* Add support for customized clangd shipping with Malterlib
* Add an option to enable Malterlib custom semantic highlighting. Disabled by default, use when you don't have the custom clangd shipped with Malterlib (or when you want faster highlighting).
* Do perceptual color conversion between Display P3 and sRGB colors
* Improve syntax highlighting for other languages

### 1.0.5

* Update colors in theme

### 1.0.6

* Update debug variable view colors
* Fix coloring of template parameters for non-class usages
* Add coloring of MConfig files
