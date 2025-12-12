import os
import pandas as pd
import numpy as np
import json
import time
import glob
from typing import List, Dict, Any, Tuple
from datetime import datetime
import functools
print = functools.partial(print, flush=True)

import pickle

# --- CONFIGURATION ---
# Adjust these paths as needed
WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))
# Point to the parent BPCS folder to ensure we find all schemas recursively
BPCS_DOCS_DIR = os.path.join(WORKSPACE_ROOT, "BPCS")
CACHE_FILE = os.path.join(WORKSPACE_ROOT, "bpcs_knowledge_base.pkl")
FBDI_TEMPLATE_PATH = os.path.join(WORKSPACE_ROOT, "FBDI Template", "Supplier Bank Accounts Compound.csv")
OUTPUT_DIR = os.path.join(WORKSPACE_ROOT, "Mapped CSV")

# Filter specific schemas to reduce noise (e.g., ["MBM"] or ["AVM", "APH"]). 
# Set to None or [] to search ALL schemas.
SCHEMA_FILTER = ["AVM", "ATY", "APH", "AVT"] 

# --- LIBRARIES ---
try:
    from google import genai
    from google.genai import types
    from dotenv import load_dotenv
    
    load_dotenv("config.env")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    
    GEMINI_AVAILABLE = True
    if GEMINI_API_KEY:
        client = genai.Client(api_key=GEMINI_API_KEY)
    print("google-genai loaded successfully.")
except ImportError:
    GEMINI_AVAILABLE = False
    print("google-genai not found. Please install: pip install google-genai python-dotenv")


class BPCSKnowledgeBase:
    def __init__(self, docs_dir: str, cache_path: str = CACHE_FILE):
        self.docs_dir = docs_dir
        self.cache_path = cache_path
        self.schema_df = pd.DataFrame()
        self.embeddings = None
        
        # Skip cache if we are filtering, to ensure we only get the requested tables
        use_cache = (not SCHEMA_FILTER) and os.path.exists(self.cache_path)

        if use_cache and self._load_from_cache():
            print("Loaded knowledge base from cache.")
        else:
            self._load_schemas()
            self._vectorize_schemas()
            # Only save to cache if we processed everything
            if not SCHEMA_FILTER:
                self._save_to_cache()

    def _load_from_cache(self) -> bool:
        """Attempts to load data from pickle cache."""
        if os.path.exists(self.cache_path):
            try:
                with open(self.cache_path, 'rb') as f:
                    data = pickle.load(f)
                    self.schema_df = data['schema_df']
                    self.embeddings = data['embeddings']
                return True
            except Exception as e:
                print(f"Failed to load cache: {e}")
        return False

    def _save_to_cache(self):
        """Saves current data to pickle cache."""
        try:
            with open(self.cache_path, 'wb') as f:
                pickle.dump({
                    'schema_df': self.schema_df,
                    'embeddings': self.embeddings
                }, f)
            print(f"Saved knowledge base to cache: {self.cache_path}")
        except Exception as e:
            print(f"Failed to save cache: {e}")

    def _load_schemas(self):
        """Loads all CSV schemas from the documentation directory."""
        all_rows = []
        # Recursive search to include subdirectories if any
        csv_files = glob.glob(os.path.join(self.docs_dir, "**", "*_Schema_Enriched.csv"), recursive=True)
        
        # Apply Schema Filter if configured
        if SCHEMA_FILTER:
            print(f"Applying Schema Filter: {SCHEMA_FILTER}")
            filtered_files = []
            for f in csv_files:
                # Check if any of the filter strings are in the filename (e.g. "MBM" in "MBM_Schema_Enriched.csv")
                fname = os.path.basename(f)
                if any(prefix in fname for prefix in SCHEMA_FILTER):
                    filtered_files.append(f)
            csv_files = filtered_files

        print(f"Found {len(csv_files)} schema files.")
        
        for file_path in csv_files:
            table_name = os.path.basename(file_path).split('_')[0] # e.g., IIM from IIM_Schema_Generated.csv
            try:
                # Use python engine and skip bad lines to handle malformed CSVs (e.g. unquoted commas)
                try:
                    df = pd.read_csv(file_path, on_bad_lines='skip', engine='python')
                except TypeError: # Fallback for older pandas
                    df = pd.read_csv(file_path, error_bad_lines=False, engine='python')
                
                # Normalize column names
                df.columns = [c.strip() for c in df.columns]
                
                for _, row in df.iterrows():
                    # Construct a rich text representation for embedding
                    col_name = str(row.get('Column Name', ''))
                    desc = str(row.get('Description', ''))
                    # keywords = str(row.get('Keywords', '')) # Removed to reduce noise
                    label = str(row.get('Label', ''))
                    data_type = str(row.get('Type', ''))
                    sample_entry = str(row.get('Sample Entry', ''))
                    
                    # Simplified full_text for cleaner embeddings
                    full_text = f"Table: {table_name} | Column: {col_name} | Label: {label} | Type: {data_type} | Description: {desc}"
                    
                    all_rows.append({
                        'table': table_name,
                        'column': col_name,
                        'sample_data': sample_entry,
                        'description': desc,
                        'full_text': full_text,
                        'source_row': row.to_dict()
                    })
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
        
        self.schema_df = pd.DataFrame(all_rows)
        print(f"Loaded {len(self.schema_df)} total schema fields.")

    def _vectorize_schemas(self):
        """Creates vector embeddings for all schema fields using Gemini."""
        if not GEMINI_AVAILABLE or self.schema_df.empty:
            return

        print("Vectorizing BPCS schema documentation using Gemini...")
        try:
            # Gemini embedding model - 'gemini-embedding-001' is the standard text embedding model
            model = 'gemini-embedding-001'
            
            # Batch processing to respect API limits (if any)
            texts = self.schema_df['full_text'].tolist()
            embeddings = []
            
            # Process in batches of 100
            batch_size = 100
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]
                result = client.models.embed_content(
                    model=model,
                    contents=batch,
                    config=types.EmbedContentConfig(
                        task_type="RETRIEVAL_DOCUMENT",
                        title="BPCS Schema"
                    )
                )
                # The new SDK returns a list of embedding objects, we need the values
                batch_embeddings = [e.values for e in result.embeddings]
                embeddings.extend(batch_embeddings)
                print(f"  Processed {min(i+batch_size, len(texts))}/{len(texts)} fields...")
                
            self.embeddings = np.array(embeddings)
            print("Vectorization complete.")
            
        except Exception as e:
            print(f"Error during vectorization: {e}")
            self.embeddings = None

    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """Searches the knowledge base for the most relevant fields."""
        if not GEMINI_AVAILABLE or self.embeddings is None:
            return []

        try:
            # Embed the query
            result = client.models.embed_content(
                model='gemini-embedding-001',
                contents=query,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_QUERY"
                )
            )
            # result.embeddings is a list, we took one string so we get one embedding
            query_embedding = np.array(result.embeddings[0].values)
            
            # Compute cosine similarity manually since we removed torch/sentence-transformers
            # Cosine Sim = (A . B) / (||A|| * ||B||)
            
            # Normalize embeddings to use dot product as cosine similarity
            norm_query = np.linalg.norm(query_embedding)
            norm_docs = np.linalg.norm(self.embeddings, axis=1)
            
            # Avoid division by zero
            if norm_query == 0:
                return []
                
            dot_products = np.dot(self.embeddings, query_embedding)
            cosine_scores = dot_products / (norm_docs * norm_query)
            
            # Get top k indices
            top_indices = np.argsort(cosine_scores)[-top_k:][::-1]
            
            results = []
            for idx in top_indices:
                row = self.schema_df.iloc[int(idx)]
                results.append({
                    'table': row['table'],
                    'column': row['column'],
                    'description': row['description'],
                    'sample_entry': row.get('sample_entry', ''),
                    'full_text': row['full_text'],
                    'score': float(cosine_scores[idx])
                })
                
            return results
            
        except Exception as e:
            print(f"Search error: {e}")
            return []

class GeminiMapper:
    def __init__(self):
        
        self.model_name = 'gemini-3-pro-preview' 
        self.table_descriptions = {}
        try:
            with open(os.path.join(WORKSPACE_ROOT, "bpcs_table_descriptions.json"), "r") as f:
                self.table_descriptions = json.load(f)
            print(f"Loaded {len(self.table_descriptions)} table descriptions.")
        except Exception as e:
            print(f"Warning: Could not load table descriptions: {e}") 

    def decide_mapping_batch(self, batch_items: List[Dict]) -> List[Dict]:
        """
        Uses Gemini to decide the best mapping for a batch of fields.
        """
        if not batch_items:
            return []

        # Identify relevant tables from candidates
        relevant_tables = set()
        for item in batch_items:
            for cand in item.get('candidates', []):
                relevant_tables.add(cand['table'])
        
        # Build dynamic table metadata section
        table_metadata_text = "BPCS Table Metadata (Relevant to this batch):\n"
        for table in sorted(relevant_tables):
            desc = self.table_descriptions.get(table, "No description available.")
            table_metadata_text += f"- **{table}**: {desc}\n"

        prompt = f"""
        You are an expert Data Migration Agent mapping Oracle FBDI fields to Legacy BPCS fields.
        Process the following batch of target fields and their candidate matches.

        TASK:
        For each field:
        1. Analyze the business meaning of the Target Field.
           - Is it Business Data (e.g., Item Number, Quantity)?
           - Is it a Configuration Flag (e.g., Enable Lot Control? Y/N)?
           - Is it a System Constant (e.g., Default UOM = EA)?

        2. Evaluate each Candidate Field against the Target.

        3. DECISION LOGIC:
           - **Direct Match**: If a legacy field has the EXACT same business purpose, select it.
           - **Configuration Flags**: If the Target is a configuration flag (Y/N) and the Legacy system has no equivalent flag, DO NOT force a map.
             - Suggest "HARDCODED" (if always Y or always N).
             - Suggest "MANUAL_CONFIG (Y/N) - Check with functional".
           - **Constant Values**: If Oracle expects a fixed value and BPCS doesn't store it, suggest "HARDCODED <Value>".
           - **Low Confidence**: If the best match is weak or ambiguous, select NONE.


        {table_metadata_text}

        DECISION EXAMPLES:
        - Target: PRIMARY_UOM_CODE | Candidate: UOM -> Direct Match
        - Target: ENABLE_LOT_CONTROL_FLAG | Candidate: (none) -> MANUAL_CONFIG (Y/N) - Check with functional
        - Target: INVENTORY_ITEM_STATUS_CODE | Candidate: Item Status -> Direct Match
        - Target: DEFAULT_SHIPPING_UOM | Candidate: (none) -> HARDCODED EA

        RESPONSE FORMAT (JSON List):
        [
            {{
                "field_index": <index provided in input>,
                "selected_option_index": <number 1-10 or null if no match>,
                "mapping_action": "<MAPPED | HARDCODED | MANUAL_CONFIG | NONE>",
                "confidence_score": <number 0-100>,
                "reasoning": "<Explain why.>"
            }},
            ...
        ]
        
        BATCH ITEMS:
        """

        for item in batch_items:
            fbdi = item['fbdi']
            candidates = item['candidates']
            
            candidates_text = ""
            if not candidates:
                candidates_text = "No candidates found."
            else:
                for i, cand in enumerate(candidates):
                    candidates_text += f"""
                    OPTION {i+1}:
                    - Table: {cand['table']}
                    - Column: {cand['column']}
                    - Description: {cand['description']}
                    - Sample Entry: {cand.get('sample_entry', 'N/A')}
                    - Context: {cand['full_text']}
                    - Similarity Score: {cand['score']:.2f}
                    """
            
            prompt += f"""
            --- FIELD INDEX: {item['index']} ---
            TARGET: {fbdi['name']}
            Description: {fbdi['description']}
            Data Type: {fbdi['type']}
            Context: {fbdi['context']}
            
            CANDIDATES:
            {candidates_text}
            
            """

        try:
            print("  Sending request to Gemini...")
            response = client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            
            # Check for safety filters or other stop reasons
            if response.candidates and response.candidates[0].finish_reason != "STOP":
                print(f"  WARNING: Gemini stopped generation. Reason: {response.candidates[0].finish_reason}")
            
            if not response.text:
                print("  ERROR: Gemini returned empty text.")
                return []

            text = response.text.strip()
            
            # Robust JSON extraction
            try:
                # Try to find JSON block
                start_idx = text.find('[')
                end_idx = text.rfind(']') + 1
                if start_idx != -1 and end_idx != -1:
                    json_str = text[start_idx:end_idx]
                    return json.loads(json_str)
                else:
                    # Fallback if no list found (maybe single object or malformed)
                    if text.startswith("```json"):
                        text = text[7:-3]
                    elif text.startswith("```"):
                        text = text[3:-3]
                    return json.loads(text)
            except json.JSONDecodeError:
                print(f"Gemini API Error (Batch): Invalid JSON received. Raw text: {text[:100]}...")
                return []
        except Exception as e:
            print(f"Gemini API Error (Batch): {e}")
            return []

    def refine_mappings(self, current_mappings: pd.DataFrame) -> pd.DataFrame:
        """
        Iterative pass: Reviews the entire set of mappings for consistency and accuracy.
        Can rewrite mappings if a better alternative is found in the provided context.
        """
        print("\n--- Starting Iterative Refinement Pass ---")
        
        # Convert dataframe to a summary string for the LLM
        # We now include the Mapping Logic which contains the alternatives
        mapping_summary = ""
        for idx, row in current_mappings.iterrows():
            if pd.notna(row['Legacy Column Name']):
                # Truncate logic to avoid excessive token usage, but keep enough for alternatives
                logic_snippet = str(row['Mapping Logic'])[:1000] 
                mapping_summary += f"Row {idx}: Target='{row['FBDI Column Name']}' -> Mapped='{row['Legacy Table Name']}.{row['Legacy Column Name']}' (Conf: {row['Confidence Score']})\nContext: {logic_snippet}\n---\n"

        prompt = f"""
        You are a Senior Data Migration Architect. Review the following mappings.
        The 'Context' includes the reasoning and the Top 5 Alternatives considered by the junior mapper.
        
        YOUR TASK:
        1. Check for Consistency: Ensure similar fields are mapped consistently.
        2. Check for Accuracy: If the currently mapped field seems wrong, but a BETTER alternative exists in the 'Top 5 Alternatives', you MUST correct it.
        3. Check for Duplicates: If multiple targets map to the same source inappropriately.
        
        CRITICAL INSTRUCTION:
        You must review EVERY row provided in the input. Do not stop after finding the first few issues. Be exhaustive.

        RESPONSE FORMAT (JSON):
        {{
            "corrections": [
                {{
                    "row_index": <number>,
                    "action": "REWRITE",
                    "new_table": "<Table Name from alternatives>",
                    "new_column": "<Column Name from alternatives>",
                    "reason": "<Why you are changing this>"
                }},
                {{
                    "row_index": <number>,
                    "action": "FLAG",
                    "issue": "<Issue description>",
                    "suggestion": "<Suggestion>"
                }}
            ]
        }}
        """
        
        try:
            response = client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            text = response.text.strip()
            
            # Robust JSON extraction for Refinement
            try:
                start_idx = text.find('{')
                end_idx = text.rfind('}') + 1
                if start_idx != -1 and end_idx != -1:
                    json_str = text[start_idx:end_idx]
                    result = json.loads(json_str)
                else:
                    if text.startswith("```json"):
                        text = text[7:-3]
                    elif text.startswith("```"):
                        text = text[3:-3]
                    result = json.loads(text)
            except json.JSONDecodeError:
                print(f"Refinement Error: Invalid JSON. Raw text: {text[:100]}...")
                return current_mappings
            
            # Apply corrections and flags
            for item in result.get('corrections', []):
                idx = item['row_index']
                if idx not in current_mappings.index:
                    continue
                
                action = item.get('action')
                
                if action == 'REWRITE':
                    new_table = item.get('new_table')
                    new_column = item.get('new_column')
                    reason = item.get('reason')
                    
                    print(f"  Refinement REWRITE Row {idx}: Changed to {new_table}.{new_column}. Reason: {reason}")
                    
                    current_mappings.at[idx, 'Legacy Table Name'] = new_table
                    current_mappings.at[idx, 'Legacy Column Name'] = new_column
                    # We append the refinement note
                    current_logic = current_mappings.at[idx, 'Mapping Logic']
                    current_mappings.at[idx, 'Mapping Logic'] = f"[REFINEMENT REWRITE: {reason}] \n{current_logic}"
                    
                elif action == 'FLAG':
                    issue = item.get('issue')
                    suggestion = item.get('suggestion')
                    
                    print(f"  Refinement FLAG Row {idx}: {issue}")
                    
                    current_logic = current_mappings.at[idx, 'Mapping Logic']
                    current_mappings.at[idx, 'Mapping Logic'] = f"[REFINEMENT FLAG: {issue} - {suggestion}] \n{current_logic}"
                    
        except Exception as e:
            print(f"Refinement Error: {e}")
            
        return current_mappings

def main():
    # 1. Setup
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    kb = BPCSKnowledgeBase(BPCS_DOCS_DIR)
    mapper = GeminiMapper()
    
    # 2. Load FBDI Template
    print(f"Loading FBDI Template: {FBDI_TEMPLATE_PATH}")
    if FBDI_TEMPLATE_PATH.endswith('.xlsx') or FBDI_TEMPLATE_PATH.endswith('.xls'):
        fbdi_df = pd.read_excel(FBDI_TEMPLATE_PATH)
    else:
        fbdi_df = pd.read_csv(FBDI_TEMPLATE_PATH)
    
    # Ensure output columns exist and are of object type to avoid FutureWarning
    for col in ['Legacy Table Name', 'Legacy Column Name', 'Legacy Field Description', 'Mapping Logic', 'Confidence Score']:
        if col not in fbdi_df.columns:
            fbdi_df[col] = None
        fbdi_df[col] = fbdi_df[col].astype(object)

    # 3. Main Mapping Loop
    print("\n--- Starting Main Mapping Loop (Batch Mode) ---")
    
    # Prepare all rows for processing
    rows_to_process = []
    for idx, row in fbdi_df.iterrows():
        fbdi_name = str(row['FBDI Column Name'])
        if pd.isna(fbdi_name) or fbdi_name == 'nan':
            continue
        rows_to_process.append((idx, row))

    batch_size = 5
    for i in range(0, len(rows_to_process), batch_size):
        batch_rows = rows_to_process[i:i+batch_size]
        batch_items = []
        
        print(f"Processing Batch {i//batch_size + 1} (Rows {i} to {min(i+batch_size, len(rows_to_process))-1})...")
        
        # Prepare batch data (Vector Search is still per-item, but fast)
        for idx, row in batch_rows:
            # Clean FBDI Name (remove asterisks)
            fbdi_name = str(row['FBDI Column Name']).replace('*', '').strip()
            fbdi_desc = str(row.get('Field Description', ''))
            fbdi_type = str(row.get('Data Type', ''))
            oracle_col = str(row.get('Oracle DB Column', ''))
            oracle_table = str(row.get('Oracle DB Table', ''))
            tech_comments = str(row.get('Tech Comments', ''))
            comments = str(row.get('Comments', ''))
            
            # Enhanced Query: Includes Oracle Technical Name for better matching
            query_text = f"{oracle_table} {fbdi_name} {oracle_col} {fbdi_desc} {tech_comments} {comments}"
            
            candidates = kb.search(query_text, top_k=10)
            
            batch_items.append({
                'index': idx,
                'fbdi': {
                    "name": fbdi_name,
                    "description": fbdi_desc,
                    "type": fbdi_type,
                    "context": f"Tech Comments: {row.get('Tech Comments', '')}"
                },
                'candidates': candidates
            })

        # Call Gemini with the batch
        decisions = mapper.decide_mapping_batch(batch_items)
        
        # Process results
        decision_map = {d.get('field_index'): d for d in decisions}
        
        for item in batch_items:
            idx = item['index']
            decision = decision_map.get(idx, {})
            candidates = item['candidates']
            
            selected_idx = decision.get('selected_option_index')
            action = decision.get('mapping_action', 'NONE')
            confidence = decision.get('confidence_score', 0)
            reasoning = decision.get('reasoning', 'Batch processing error or no response.')

            # Format top 5 candidates for context
            top_candidates = candidates[:5]
            candidates_info = "\n[Top 5 Alternatives Considered:]"
            for i, cand in enumerate(top_candidates):
                candidates_info += f"\n{i+1}. {cand['table']}.{cand['column']} - {cand['description']} (Score: {cand['score']:.2f})"

            # Helper to append logic without overwriting existing notes
            current_logic = fbdi_df.at[idx, 'Mapping Logic']
            if pd.notna(current_logic) and str(current_logic).strip():
                final_reasoning = f"{current_logic} — {reasoning}\n{candidates_info}"
            else:
                final_reasoning = f"{reasoning}\n{candidates_info}"

            if action == 'MAPPED' and selected_idx is not None and isinstance(selected_idx, int) and 1 <= selected_idx <= len(candidates):
                match = candidates[selected_idx - 1]
                fbdi_df.at[idx, 'Legacy Table Name'] = match['table']
                fbdi_df.at[idx, 'Legacy Column Name'] = match['column']
                fbdi_df.at[idx, 'Legacy Field Description'] = match['description']
                fbdi_df.at[idx, 'Mapping Logic'] = final_reasoning
                fbdi_df.at[idx, 'Confidence Score'] = confidence
                print(f"  Row {idx}: Mapped to {match['table']}.{match['column']} (Conf: {confidence})")
            elif action in ['HARDCODED', 'MANUAL_CONFIG']:
                 fbdi_df.at[idx, 'Legacy Table Name'] = action
                 fbdi_df.at[idx, 'Legacy Column Name'] = action
                 fbdi_df.at[idx, 'Mapping Logic'] = final_reasoning
                 fbdi_df.at[idx, 'Confidence Score'] = confidence
                 print(f"  Row {idx}: Action: {action}")
            else:
                fbdi_df.at[idx, 'Mapping Logic'] = final_reasoning
                fbdi_df.at[idx, 'Confidence Score'] = confidence
                print(f"  Row {idx}: No match found (Action: {action}).")
            
        # Save intermediate results periodically
        fbdi_df.to_csv(os.path.join(OUTPUT_DIR, "mapping_in_progress.csv"), index=False)

    # 4. Iterative Refinement

    # 4. Iterative Refinement
    if GEMINI_AVAILABLE:
        fbdi_df = mapper.refine_mappings(fbdi_df)

    # 5. Final Export
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    input_filename = os.path.splitext(os.path.basename(FBDI_TEMPLATE_PATH))[0]
    output_path = os.path.join(OUTPUT_DIR, f"{input_filename}_{timestamp}.csv")
    fbdi_df.to_csv(output_path, index=False)
    print(f"\nMapping Complete! Saved to: {output_path}")

if __name__ == "__main__":
    main()
