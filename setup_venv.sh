#!/bin/bash

# setup_venv.sh - Setup Python virtual environment for MalterlibVSCode scripts
# This script creates a .venv directory and installs all required dependencies

set -e  # Exit on any error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"

echo "🔧 Setting up Python virtual environment for MalterlibVSCode scripts..."
echo "📁 Project root: $PROJECT_ROOT"

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed or not in PATH"
    echo "   Please install Python 3.8+ before running this script"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "🐍 Found Python $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
else
    echo "📦 Virtual environment already exists at $VENV_DIR"
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install required dependencies
echo "📥 Installing required packages from requirements.txt..."

if [ -f "$PROJECT_ROOT/requirements.txt" ]; then
    pip install -r "$PROJECT_ROOT/requirements.txt"
else
    echo "❌ Error: requirements.txt not found"
    echo "   Make sure requirements.txt exists in the project root"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Installed packages:"
pip list --format=columns

echo ""
echo "🚀 To use the scripts:"
echo "   Run any script directly from the scripts/ directory:"
echo "      ./scripts/update_all.py"
echo "      ./scripts/convert_theme_to_srgb.py"
echo "      ./scripts/generate_settings_from_theme.py"
echo "      ./scripts/extract_keywords.py"
echo "      ./scripts/generate_classifications.py"
echo ""
echo "💡 The scripts use .venv in their shebang, so no need to activate manually!"
echo "💡 Always run scripts from the project root directory!"

# Verify installation by checking critical imports
echo "🔍 Verifying installation..."
python3 -c "
try:
    from PIL import Image, ImageCms
    import json5
    print('✅ All required packages imported successfully')
    
    # Test ICC profile access (macOS specific)
    try:
        p3_path = '/System/Library/ColorSync/Profiles/Display P3.icc'
        srgb_path = '/System/Library/ColorSync/Profiles/sRGB Profile.icc'
        import os
        if os.path.exists(p3_path) and os.path.exists(srgb_path):
            print('✅ macOS ICC color profiles found')
        else:
            print('⚠️  macOS ICC color profiles not found - color conversion may not work')
    except Exception as e:
        print(f'⚠️  Could not verify ICC profiles: {e}')
        
except ImportError as e:
    print(f'❌ Import error: {e}')
    exit(1)
"

echo ""
echo "🎉 Virtual environment setup completed successfully!"