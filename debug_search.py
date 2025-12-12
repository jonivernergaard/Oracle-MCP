import os
import pandas as pd
import numpy as np
import glob
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Setup
load_dotenv("config.env")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

WORKSPACE_ROOT = os.path.dirname(os.path.abspath(__file__))
# Try pointing to the parent BPCS folder to ensure we catch everything
BPCS_DOCS_DIR = os.path.join(WORKSPACE_ROOT, "BPCS") 

class BPCSKnowledgeBase:
    def __init__(self, docs_dir: str):
        self.docs_dir = docs_dir
        self.schema_df = pd.DataFrame()
        self.embeddings = None
        self._load_schemas()
        self._vectorize_schemas()

    def _load_schemas(self):
        all_rows = []
        # Recursive search
        csv_files = glob.glob(os.path.join(self.docs_dir, "**", "*_Schema_Enriched.csv"), recursive=True)
        print(f"Found {len(csv_files)} schema files.")
        
        found_tables = set()
        for file_path in csv_files:
            table_name = os.path.basename(file_path).split('_')[0]
            found_tables.add(table_name)
            try:
                df = pd.read_csv(file_path)
                df.columns = [c.strip() for c in df.columns]
                for _, row in df.iterrows():
                    col_name = str(row.get('Column Name', ''))
                    desc = str(row.get('Description', ''))
                    keywords = str(row.get('Keywords', ''))
                    full_text = f"Table: {table_name} | Column: {col_name} | Description: {desc} | Keywords: {keywords}"
                    all_rows.append({
                        'table': table_name,
                        'column': col_name,
                        'description': desc,
                        'full_text': full_text
                    })
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
        
        self.schema_df = pd.DataFrame(all_rows)
        print(f"Loaded {len(self.schema_df)} fields.")
        print(f"Tables found: {sorted(list(found_tables))}")
        if "AVM" in found_tables:
            print("SUCCESS: AVM table was found.")
        else:
            print("FAILURE: AVM table was NOT found.")

    def _vectorize_schemas(self):
        print("Vectorizing...")
        try:
            model = 'gemini-embedding-001'
            texts = self.schema_df['full_text'].tolist()
            embeddings = []
            batch_size = 100
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]
                result = client.models.embed_content(
                    model=model,
                    contents=batch,
                    config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT")
                )
                batch_embeddings = [e.values for e in result.embeddings]
                embeddings.extend(batch_embeddings)
            self.embeddings = np.array(embeddings)
            print("Vectorization complete.")
        except Exception as e:
            print(f"Error during vectorization: {e}")

    def search(self, query: str, top_k: int = 10):
        print(f"\nSearching for: '{query}'")
        try:
            result = client.models.embed_content(
                model='gemini-embedding-001',
                contents=query,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY")
            )
            query_embedding = np.array(result.embeddings[0].values)
            norm_query = np.linalg.norm(query_embedding)
            norm_docs = np.linalg.norm(self.embeddings, axis=1)
            dot_products = np.dot(self.embeddings, query_embedding)
            cosine_scores = dot_products / (norm_docs * norm_query)
            top_indices = np.argsort(cosine_scores)[-top_k:][::-1]
            
            print("\nTop Results:")
            for idx in top_indices:
                row = self.schema_df.iloc[int(idx)]
                print(f"{row['table']}.{row['column']} ({row['description']}) - Score: {cosine_scores[idx]:.4f}")
        except Exception as e:
            print(f"Search error: {e}")

if __name__ == "__main__":
    kb = BPCSKnowledgeBase(BPCS_DOCS_DIR)
    # Test the exact query that failed
    query = "HZ_PARTIES Supplier Name PARTY_NAME Supplier name (Legal Name) - Required by Business based on Huhtamaki Guidelines Field name : Supplier name , need validation by data owners to confirm the legal entity name"
    kb.search(query)
