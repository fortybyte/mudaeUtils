import json
import re

def extract_characters(text):
    """Extract character names from the input text format."""
    characters = []
    
    # Split text into lines
    lines = text.strip().split('\n')
    
    for line in lines:
        # Match pattern: #number - Character Name (with optional heart emoji) - Series Name
        # The heart emoji and spaces around it are optional
        match = re.match(r'^#\d+\s*-\s*(.+?)(?:\s*💞)?\s*-\s*.+$', line)
        if match:
            character_name = match.group(1).strip()
            characters.append(character_name)
    
    return characters

def update_chars_json(new_characters, json_file='waifuGames/server/chars.json'):
    """Update chars.json with new character names."""
    try:
        # Read existing characters
        with open(json_file, 'r', encoding='utf-8') as f:
            existing_chars = json.load(f)
    except FileNotFoundError:
        existing_chars = []
    
    # Convert to lowercase for comparison
    existing_lower = [char.lower() for char in existing_chars]
    
    # Add new characters that don't already exist (case-insensitive check)
    added_count = 0
    for char in new_characters:
        if char.lower() not in existing_lower:
            existing_chars.append(char)
            added_count += 1
    
    # Write back to file
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(existing_chars, f, indent=2, ensure_ascii=False)
    
    return added_count, len(existing_chars)

if __name__ == "__main__":
    # Example usage
    sample_input = """#1 - Zero Two  💞 - DARLING in the FRANXX
#2 - Hatsune Miku  💞 - VOCALOID
#3 - Rem  💞 - Re:Zero kara Hajimeru Isekai Seikatsu
#4 - Megumin  💞 - Kono Subarashii Sekai ni Shukufuku wo!
#5 - Rias Gremory - High School DxD
#6 - Mai Sakurajima  💞 - Seishun Buta Yarou
#7 - Saber - Fate/stay night
#8 - Nami - One Piece
#9 - Power  💞 - Chainsaw Man
#10 - Satoru Gojo - Jujutsu Kaisen
#11 - Asuna  💞 - Sword Art Online
#12 - Mikasa Ackerman - Attack on Titan
#13 - Albedo  💞 - Overlord
#14 - Makima  💞 - Chainsaw Man
#15 - Nezuko Kamado - Kimetsu no Yaiba"""
    
    # Get user input
    print("Enter character list (press Enter twice when done):")
    user_input_lines = []
    while True:
        line = input()
        if line == "":
            if user_input_lines and user_input_lines[-1] == "":
                break
            user_input_lines.append(line)
        else:
            user_input_lines.append(line)
    
    # Use user input if provided, otherwise use sample
    text_input = '\n'.join(user_input_lines[:-1]) if user_input_lines[:-1] else sample_input
    
    # Extract characters
    characters = extract_characters(text_input)
    
    print(f"\nExtracted {len(characters)} characters:")
    for char in characters:
        print(f"  - {char}")
    
    # Update JSON file
    added, total = update_chars_json(characters)
    print(f"\nAdded {added} new characters to chars.json")
    print(f"Total characters in file: {total}")