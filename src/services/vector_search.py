import os
import sys
import json
import time
import random
import struct
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
from google.genai import types
from loguru import logger
import sqlite_vec
from rapidfuzz import fuzz, process
from src.config import BPCS_DB_PATH


try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3

class VectorSearchService:
    def __init__(self, db_path: str = BPCS_DB_PATH, collection_name: str = "field mappings"):

        """ 
        Initialize VectorSearchService with SQLite-vec and Gemini client.
        
        Args:
            BPCS_DB_PATH (str): Path to the SQLite database 
            collection_name (str): Name of the collection to use
            """
        
        # Ensure we point to a file, not just the directory
        if os.path.isdir(db_path):
            self.db_path = os.path.join(db_path, "vector_store.db")
        else:
            self.db_path = db_path

        self.collection_name = collection_name

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set.")

        self.genai_client = genai.Client(api_key=api_key)
        self.embedding_model = "gemini-embedding-001"
        self.vector_size = 3072

        self._init_db()


    def _init_db(self):
        """ Initialize the SQLite database with sqlite-vec extension."""

        self.conn = sqlite3.connect(self.db_path, check_same_thread=False, timeout = 30)
        # Load sqlite-vec extension

        try:
            self.conn.enable_load_extension(True)
            sqlite_vec.load(self.conn)
            self.conn.enable_load_extension(False)
        except Exception as e:
            logger.error(f"Failed to load sqlite-vec extension: {e}")
            # Continue, but all vector operations will fail
        
        # create documents table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY, 
                file_path TEXT,
                payload JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );            
                          """)
        
        # create vector index
        try:
            self.conn.execute(f"""
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(
                    embedding float[{self.vector_size}]
                );
            """)
        except Exception as e:
            logger.error(f"Failed to create vec_items table: {e}")
            # Continue, but all vector operations will fail

        # Create FTS Table
        try:
            self.conn.execute("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                        text,
                        doc_id UNINDEXED
                    );
                """)
        except Exception as e:
            logger.error(f"Error creating FTS table: {e}")
            # Continue, but all FTS operations will fail

    def _serialize_f32(self, vector: List[float]) -> bytes:
        """ Serialize a list of floats to bytes for sqlite-vec storage."""
        return struct.pack(f'{len(vector)}f', *vector)


    def get_embedding(self, text: str, task_type: str = "SEMANTIC SIMILARITY", retries: int = 5) -> List[List[float]]:
        """ Get embedding from Gemini API with retries."""
        base_delay = 1
        for attempt in range (retries):
            try:
                result = self.genai_client.models.embed_content(
                    model = self.embedding_model,
                    content = text,
                    config=types.EmbedContentConfig(task_type=task_type)
                )

                return result.embeddings[0].values
            # result embeddings is a list of ContentEmbedding
            except Exception as e:
                is_rate_limit = "429" in str(e) or "ResourceExhausted" in str(e)
                if is_rate_limit or attempt < retries - 1:
                    delay = (base_delay * (2 ** attempt)) + random.uniform(0, 1)
                    if is_rate_limit:
                        logger.warning(f"Rate limit hit. Retrying in {delay:.2f}s...")
                    else:
                        logger.warning(f"Embedding error: {e}. Retrying in {delay:.2f}s...")
                    time.sleep(delay)
                else:
                    logger.error(f"Failed to generate embedding after {retries} attempts {e}")
                    return []
        return []
    

    def get_embeddings_batch(self, texts: List[str], task_type: str = "SEMANTIC_SIMILARITY", retries: int = 5) -> List[List[float]]:

        """ Get embeddings from Gemini API for batches"""

        base_delay = 1
        for attempt in range (retries):
            try:
                result = self.genai_client.models.embed_content(
                    model = self.embedding_model,
                    content = texts,
                    config = types.EmbedContentConfig(task_type=task_type)
                )
                # result.embeddings is a list of ContentEmbedding

                return [e.values for e in result.embeddings]
            except Exception as e:
                is_rate_limit = "429" in str (e) or "ResourceExhausted" in str (e)
                if is_rate_limit or attempt < retries -1:
                    delay = (base_delay * (2 ** attempt)) + random.uniform(0, 1)
                    if is_rate_limit:
                        logger.warning(f"Rate limit hit. Retrying in {delay:.2f}s...")
                    else:
                        logger.warning(f"Embedding error : {e}. Retrying in {delay:.2f}s...")
                    time.sleep(delay)
                else:
                    logger.error(f"Failed to generate embeddings fater {retries} attempts: {e}")
                    return []
        return []
    
    def upsert_fields(self, fields: List [Dict], batch_size: int = 100, max_workers: int = 15):
        """ Upsert fields into the SQLite database using parallel processing for embeddings with batching.
        """

        total_fields = len(fields):
        logger.info(f"Starting upsert for {total_fields} fields with {max_workers} workers and batch size {batch_size}.")
        
        def get_text(field):
            text = field.get("text", "")
            if not text:
                parts = []
                if "name" in field: parts.append(f"Name: {field['name']}")
                if "description" in field: parts.append (f"Description: {field['description']}")
                if "label" in field: parts.append(f"Label: {field['label']}")
                text = ", ".join(parts)
            return text
        

        # filter and prepare fields

        valid_fields = []
        for f in fields:
            t = get_text(f)
            if t:
                f_copy = f.copy()
                f_copy["_text_for_embedding"] = t
                valid_fields.append(f_copy)

        # create chunks

        chunks = [valid_fields[i:i + batch_size] for i in range (0, len(valid_fields), batch_size)]

        def process_chunk(chunk):
            texts = [f["_text_for_embedding"] for f in chunk]
            vectors = self.get_embeddings_batch(texts, task_type= "SEMANTIC_SIMILARITY")

            if not vectors or len(vectors) != len(chunk):
                return None
            
            results = []
            for i, field in enumerate(chunk):
                # prepare payload
                payload = field.copy()
                if "_text_for_embedding" in payload:
                    del payload["_text_for_embedding"]

                if "text" not in payload:
                    payload["text_content"] = texts[i]

                results.append({
                    "vector": vectors[i],
                    "payload": payload,
                    "file_path": field.get("file_path", "")
                })
            return results
        
        upserted_count = 0

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            #submit all tasks

            future_to_chunk = {executor.submit(process_chunk, chunk): chunk for chunk in chunks}

            for future in as_completed(future_to_chunk):
                try:
                    result = future.result()
                    if result:
                        self._insert_batch(result)
                        upserted_count += len(result)
                        logger.info(f"Upserted batch. Total: {upserted_count}/{len(valid_fields)}")

                except Exception as e:
                    logger.error(f"Error processing chunk: {e}")

        def _insert_batch(self, items: List[Dict]):
            """Insert a batch of items into SQLite."""

            try:
                with self.conn:
                    for item in items:
                        # insert document
                        cursor = self.conn.execute(
                            "INSERT INTO documents (file_path, payload) VALUES (?, ?)",
                            (item["file_path"], json.dumps(item["payload"]))
                        )
                        doc_id = cursor.lastrowid


                        # insert vector

                        serialized_vec = self._serialize_f32(item["vector"])
                        self.conn.execute(
                            "INSERT INTO vec_items (rowid, embedding) VALUES (?, ?)",
                            (doc_id, serialized_vec)
                        )

                        # insert into FTS
                        text_content = item["payload"].get("text", "")



                            (item["file_path"], json.dumps(item["payload"]["description"]))
                        )



    
    






