#!./.venv/bin/python3
import json
import re
import json5

# Scopes that should be ignored in the comparison (not reported as missing)
EXCEPTION_SCOPES = {
    "malterlib.character",
    "malterlib.comment.background",
    "malterlib.comment.foreground",
    "malterlib.comment.url",
    "malterlib.documentation.comment.foreground",
    "malterlib.documentation.comment.foreground.keyword",
    "malterlib.number",
    "malterlib.operator",
    "malterlib.plain.text",
    "malterlib.preprocessor.operator",
    "malterlib.string",
    "malterlib.typedef",
    "malterlib.unknown"
}

def clean_json_comments_and_commas(content):
    """Remove JavaScript-style comments, trailing commas, and tabs from JSON content"""
    # Remove single-line comments
    content = re.sub(r'//.*$', '', content, flags=re.MULTILINE)
    # Remove multi-line comments (if any)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    # Remove trailing commas before }} or ]]
    content = re.sub(r',\s*([}\]])', r'\1', content)
    # Replace tabs with spaces
    content = content.replace('\t', '    ')
    return content

def extract_theme_scopes():
    """Extract all malterlib.* scopes from the theme file using json5 for relaxed parsing"""
    with open('themes/malterlib.json', 'r') as f:
        theme_data = json5.load(f)
    
    theme_scopes = set()
    
    # Extract scopes from tokenColors
    for token_color in theme_data.get('tokenColors', []):
        scopes = token_color.get('scope', [])
        if isinstance(scopes, str):
            scopes = [scopes]
        
        for scope in scopes:
            if scope.startswith('malterlib.'):
                theme_scopes.add(scope)
    
    return theme_scopes

def extract_package_scopes():
    """Extract all malterlib.* scopes from package.json semanticTokenScopes"""
    with open('package.json', 'r') as f:
        package_data = json.load(f)
    
    package_scopes = set()
    
    # Extract scopes from semanticTokenScopes
    for language_config in package_data.get('contributes', {}).get('semanticTokenScopes', []):
        scopes_dict = language_config.get('scopes', {})
        for token_type, scope_list in scopes_dict.items():
            for scope in scope_list:
                if scope.startswith('malterlib.'):
                    package_scopes.add(scope)
    
    return package_scopes

def main():
    theme_scopes = extract_theme_scopes()
    package_scopes = extract_package_scopes()
    
    print("=== SCOPE COMPARISON ===")
    print(f"Total scopes in theme: {len(theme_scopes)}")
    print(f"Total scopes in package.json: {len(package_scopes)}")
    print(f"Exception scopes (ignored): {len(EXCEPTION_SCOPES)}")
    print()
    
    # Find scopes in package.json that are NOT in theme (excluding exceptions)
    missing_in_theme = package_scopes - theme_scopes - EXCEPTION_SCOPES
    
    if missing_in_theme:
        print("=== SCOPES IN PACKAGE.JSON BUT MISSING IN THEME ===")
        for scope in sorted(missing_in_theme):
            print(f"  {scope}")
        print(f"\nTotal missing: {len(missing_in_theme)}")
    else:
        print("✅ All package.json scopes are present in theme")
    
    print()
    
if __name__ == "__main__":
    main() 