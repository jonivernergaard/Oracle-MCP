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


    def get_embedding(self, text: str, task_type: str = "SEMANTIC SIMILARITY", RETRIES: int = 5) -> List[List[float]]:
        """ Get embedding from Gemini API with retries."""
        base_delay = 1
        for attempt in range (RETRIES):
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
                if is_rate_limit:
                    logger.warning()
        

        


    
    






