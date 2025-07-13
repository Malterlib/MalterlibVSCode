#!./.venv/bin/python3
import json
import json5
from collections import defaultdict

def load_color_order():
    """Load the color order from colorexamples.json"""
    with open('colorexamples.json', 'r') as f:
        color_examples = json.load(f)
    
    # Create a mapping of color (lowercase) to its position in the array
    color_order = {}
    for i, entry in enumerate(color_examples):
        color = entry.get('color', '').lower()
        if color:
            color_order[color] = i
    
    return color_order

def get_token_color_priority(token_color, color_order):
    """Get priority for sorting token colors. Lower number = higher priority."""
    settings = token_color.get('settings', {})
    foreground = settings.get('foreground', '').lower()
    
    # Check if any scope contains malterlib
    scopes = token_color.get('scope', [])
    if isinstance(scopes, str):
        scopes = [scopes]
    
    has_malterlib = any('malterlib.' in scope for scope in scopes)
    
    # Check if the color is found in colorexamples.json
    if foreground in color_order:
        # Priority 0: Colors found in colorexamples.json (sorted by color order)
        return (0, color_order.get(foreground, float('inf')))
    else:
        # Priority 1: Colors not found in colorexamples.json
        if has_malterlib:
            # Priority 1: Malterlib entries with colors not in colorexamples.json
            return (1, 0)
        else:
            # Priority 2: Non-malterlib entries with colors not in colorexamples.json
            return (2, 0)

def deduplicate_token_colors(theme_data):
    """Deduplicate tokenColors by merging scopes with identical settings"""
    
    # Group token colors by their settings
    settings_groups = defaultdict(list)
    
    for token_color in theme_data.get('tokenColors', []):
        settings = token_color.get('settings', {})
        # Convert settings to a hashable format for grouping
        settings_key = json.dumps(settings, sort_keys=True)
        settings_groups[settings_key].append(token_color)
    
    # Create new tokenColors array with merged scopes
    new_token_colors = []
    
    for settings_key, token_colors in settings_groups.items():
        # Get the settings from the first entry (they're all the same)
        settings = json.loads(settings_key)
        
        # Collect all scopes from all entries with these settings
        all_scopes = []
        for token_color in token_colors:
            scopes = token_color.get('scope', [])
            if isinstance(scopes, str):
                scopes = [scopes]
            all_scopes.extend(scopes)
        
        # Remove duplicates while preserving order
        unique_scopes = []
        seen = set()
        for scope in all_scopes:
            if scope not in seen:
                unique_scopes.append(scope)
                seen.add(scope)
        
        # Create new entry with merged scopes
        new_entry = {
            'scope': unique_scopes,
            'settings': settings
        }
        
        new_token_colors.append(new_entry)
    
    return new_token_colors

def main():
    # Load color order
    color_order = load_color_order()
    print(f"Loaded {len(color_order)} colors from colorexamples.json")
    
    # Read the theme file
    with open('themes/malterlib.json', 'r') as f:
        theme_data = json5.load(f)
    
    # Get original count
    original_count = len(theme_data.get('tokenColors', []))
    
    # Analyze scope distribution before deduplication
    scope_to_entries = defaultdict(list)
    for i, token_color in enumerate(theme_data.get('tokenColors', [])):
        scopes = token_color.get('scope', [])
        if isinstance(scopes, str):
            scopes = [scopes]
        color = token_color.get('settings', {}).get('foreground', 'N/A')
        for scope in scopes:
            scope_to_entries[scope].append((i, color))
    
    # Find scopes that appear in multiple entries
    duplicate_scopes = {scope: entries for scope, entries in scope_to_entries.items() if len(entries) > 1}
    
    # Deduplicate
    new_token_colors = deduplicate_token_colors(theme_data)
    
    # Sort token colors by priority
    new_token_colors.sort(key=lambda x: get_token_color_priority(x, color_order))
    
    # Update the theme data
    theme_data['tokenColors'] = new_token_colors
    
    # Write back to file
    with open('themes/malterlib.json', 'w') as f:
        json.dump(theme_data, f, indent=4)
    
    # Report statistics
    print(f"Original tokenColors entries: {original_count}")
    print(f"After deduplication: {len(new_token_colors)}")
    print(f"Reduction: {original_count - len(new_token_colors)} entries")
    
    # Count entries with colors from colorexamples.json
    colorexamples_count = sum(1 for tc in new_token_colors 
                             if tc.get('settings', {}).get('foreground', '').lower() in color_order)
    
    # Count malterlib entries with colors not in colorexamples.json
    malterlib_other_count = sum(1 for tc in new_token_colors 
                               if tc.get('settings', {}).get('foreground', '').lower() not in color_order
                               and any('malterlib.' in scope for scope in tc.get('scope', [])))
    
    # Count non-malterlib entries with colors not in colorexamples.json
    non_malterlib_other_count = len(new_token_colors) - colorexamples_count - malterlib_other_count
    
    print(f"Entries with colors from colorexamples.json: {colorexamples_count}")
    print(f"Malterlib entries with other colors: {malterlib_other_count}")
    print(f"Non-malterlib entries with other colors: {non_malterlib_other_count}")
    
    # Report duplicate scopes
    if duplicate_scopes:
        print(f"\n⚠️  Found {len(duplicate_scopes)} scopes that appeared in multiple entries (now merged):")
        for scope, entries in sorted(duplicate_scopes.items()):
            print(f"\n  {scope} (appeared in {len(entries)} entries):")
            for entry_idx, color in entries:
                print(f"    Entry {entry_idx + 1}: {color}")
    else:
        print(f"\n✅ No duplicate scopes found - all scopes were unique")
    
    print("\nFirst 10 entries after sorting:")
    for i, token_color in enumerate(new_token_colors[:10]):
        settings = token_color.get('settings', {})
        foreground = settings.get('foreground', '')
        scopes = token_color.get('scope', [])
        if isinstance(scopes, str):
            scopes = [scopes]
        
        # Determine entry type
        if foreground.lower() in color_order:
            entry_type = "colorexamples"
        elif any('malterlib.' in scope for scope in scopes):
            entry_type = "malterlib-other"
        else:
            entry_type = "non-malterlib-other"
        
        print(f"  {i+1}. [{entry_type}] {foreground} - {len(scopes)} scopes")
        if scopes:
            print(f"      First scope: {scopes[0]}")

if __name__ == "__main__":
    main() 