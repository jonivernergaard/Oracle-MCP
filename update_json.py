import pandas as pd
import json
import os
import glob

# Paths
EXCEL_PATH = "BPCS Tables metadata.xlsx"
JSON_PATH = "bpcs_table_descriptions.json"
BPCS_DIR = "BPCS"

def main():
    # 1. Load Excel Data
    print("Loading Excel metadata...")
    try:
        df = pd.read_excel(EXCEL_PATH)
        # Create a dictionary: Table Name -> Description
        # Ensure table names are stripped and uppercase
        excel_map = {}
        for _, row in df.iterrows():
            if pd.notna(row['TABLE_NAME']):
                t_name = str(row['TABLE_NAME']).strip().upper()
                desc = str(row['TABLE_TEXTS_EN']).strip() if pd.notna(row['TABLE_TEXTS_EN']) else "No description"
                excel_map[t_name] = desc
        print(f"Loaded {len(excel_map)} descriptions from Excel.")
    except Exception as e:
        print(f"Error loading Excel: {e}")
        excel_map = {}

    # 2. Load Existing JSON
    print("Loading existing JSON...")
    if os.path.exists(JSON_PATH):
        with open(JSON_PATH, 'r') as f:
            existing_json = json.load(f)
    else:
        existing_json = {}

    # 3. Scan BPCS Directory
    print(f"Scanning {BPCS_DIR}...")
    csv_files = glob.glob(os.path.join(BPCS_DIR, "*_Schema_Enriched.csv"))
    
    # 4. Update JSON
    updated_json = existing_json.copy()
    
    for file_path in csv_files:
        filename = os.path.basename(file_path)
        table_name = filename.split('_')[0].upper()
        
        if table_name not in updated_json:
            # Look up in Excel map
            if table_name in excel_map:
                updated_json[table_name] = excel_map[table_name]
                print(f"Added {table_name}: {excel_map[table_name]}")
            else:
                # Fallback or leave empty? User asked to use knowledge.
                # I will add a placeholder that indicates it needs manual check if not found
                updated_json[table_name] = "Description not found in metadata"
                print(f"Added {table_name}: Description not found")
        else:
            # Optional: Update existing if Excel has better info? 
            # For now, let's respect existing manual entries if they exist, 
            # but maybe the user wants to overwrite? 
            # The user said "populate the json with the correct number of schemas", implying missing ones.
            pass

    # 5. Save
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(updated_json, f, indent=4)
    
    print(f"Updated {JSON_PATH} with {len(updated_json)} tables.")

if __name__ == "__main__":
    main()
