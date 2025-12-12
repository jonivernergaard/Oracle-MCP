import os
import pandas as pd
import re
import glob

# Configuration
BPCS_DIR = "BPCS"
BPCS_TXT_PATH = "bpcs.txt"

def parse_bpcs_txt(file_path):
    """Parses bpcs.txt to extract table and column information."""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    tables = {}
    current_table = None

    # Regex for table headers
    # Matches: "Table: B610F/IIM (inv100) - Items", "AVM (acp100) - Vendors", "B610F/ETYK - Label Data"
    table_pattern = re.compile(r'(?:Table:\s*)?(?:B610F/)?([A-Z0-9]+)\s*(?:\(.*\))?\s*-\s*(.*)')
    
    # Regex for column definitions
    # Matches: "IPROD: item", "IREF01-05: five reference fields"
    col_pattern = re.compile(r'^([A-Z0-9]+)(?:-([0-9]+))?:\s*(.*)')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check for table header
        # We look for lines that look like table headers. 
        # The format in bpcs.txt is a bit inconsistent, so we try to match the start.
        if "Table:" in line or " - " in line:
            # Try to extract table name
            match = table_pattern.match(line)
            if match:
                table_name = match.group(1)
                table_desc = match.group(2)
                current_table = table_name
                tables[current_table] = {'description': table_desc, 'columns': {}}
                print(f"Found Table: {current_table} ({table_desc})")
                continue

        # Check for column definition if we are inside a table block
        if current_table:
            match = col_pattern.match(line)
            if match:
                col_prefix = match.group(1)
                range_end = match.group(2)
                desc = match.group(3)

                if range_end:
                    # Handle ranges like IREF01-05
                    # Assuming the prefix ends with numbers, e.g., IREF01
                    # We need to find the start number.
                    # Let's look at the prefix. IREF01 -> IREF, 01
                    
                    # Split prefix into alpha and numeric parts
                    sub_match = re.match(r'([A-Z]+)([0-9]+)', col_prefix)
                    if sub_match:
                        base_name = sub_match.group(1)
                        start_num_str = sub_match.group(2)
                        start_num = int(start_num_str)
                        end_num = int(range_end)
                        
                        width = len(start_num_str) # Keep leading zeros if any
                        
                        for i in range(start_num, end_num + 1):
                            # Format number with leading zeros
                            num_str = f"{i:0{width}d}"
                            full_col_name = f"{base_name}{num_str}"
                            tables[current_table]['columns'][full_col_name] = desc
                            # print(f"  - {full_col_name}: {desc}")
                else:
                    # Single column
                    tables[current_table]['columns'][col_prefix] = desc
                    # print(f"  - {col_prefix}: {desc}")

    return tables

def update_schemas(tables_info, bpcs_dir):
    """Updates CSV schemas with information from bpcs.txt."""
    
    # Get all schema files
    csv_files = glob.glob(os.path.join(bpcs_dir, "*_Schema_Enriched.csv"))
    
    for csv_path in csv_files:
        filename = os.path.basename(csv_path)
        table_name = filename.split('_')[0] # e.g., IIM from IIM_Schema_Enriched.csv
        
        if table_name in tables_info:
            print(f"Updating {filename}...")
            try:
                df = pd.read_csv(csv_path)
                
                # Ensure Description column exists
                if 'Description' not in df.columns:
                    df['Description'] = ""
                
                updated_count = 0
                for idx, row in df.iterrows():
                    col_name = str(row['Column Name']).strip()
                    
                    if col_name in tables_info[table_name]['columns']:
                        new_desc = tables_info[table_name]['columns'][col_name]
                        current_desc = str(row.get('Description', ''))
                        
                        # Avoid duplicating if already present
                        if new_desc not in current_desc:
                            if current_desc and current_desc != 'nan':
                                combined_desc = f"{current_desc} | [BPCS Docs]: {new_desc}"
                            else:
                                combined_desc = f"[BPCS Docs]: {new_desc}"
                            
                            df.at[idx, 'Description'] = combined_desc
                            updated_count += 1
                
                if updated_count > 0:
                    df.to_csv(csv_path, index=False)
                    print(f"  Updated {updated_count} columns.")
                else:
                    print("  No columns needed updates.")
                    
            except Exception as e:
                print(f"Error processing {csv_path}: {e}")

if __name__ == "__main__":
    print("Parsing bpcs.txt...")
    tables_info = parse_bpcs_txt(BPCS_TXT_PATH)
    
    print("\nUpdating schemas...")
    update_schemas(tables_info, BPCS_DIR)
    print("\nDone.")
