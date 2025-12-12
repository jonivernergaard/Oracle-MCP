from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

# Load environment variables from config.env
load_dotenv("config.env")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

class LLMClient:
    def __init__(self, provider: str = "google", model: str = "gemini-3-pro-preview", api_key: str = None):
        self.provider = provider
        self.model = model
        self.api_key = api_key

        if self.provider.lower() == "google":
            self.api_key = self.api_key or os.getenv("GEMINI_API_KEY")
            self.client = genai.Client(api_key=self.api_key)

    def _generate(self, prompt: str) -> dict:
        if self.provider == "google":
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=[types.Part.from_text(text=prompt)],
                    config=types.GenerateContentConfig(
                        temperature=0,
                    )
                )
                return {
                    "text": response.text,
                    "tokens": response.usage_metadata.total_token_count if response.usage_metadata else 0
                }
            except Exception as e: 
                return {"text": f"Error calling Google LLM: {e}", "tokens": 0}
            

    def generate_mapping(self, prompt: str) -> dict:
        with open("debug_prompt.txt", "w", encoding ="utf-8") as f:
            f.write(prompt)
        return self._generate(prompt)
    
    def select_next_batch_files(self, all_files: list[str], processed_files: list[str], initial_csv_content: str, 
                                current_csv_content: str, iteration: int, previous_thoughts: str = "", search_context: str ="") -> dict:
        files_str = ", ".join([f.replace("\\", "/") for f in all_files])
        processed_str = ", ".join([f.replace("\\", "/") for f in processed_files])
    
        prompt = f"""

I am performing an iterative search to map a CSV file using documentation files:

Iteration: {iteration}/5

Available BPCS Schema Files:
{files_str}

Already Processed Files:
{processed_str}

Previous Agent Thoughts:
{previous_thoughts}

Vector Search Hints (Top matches for CSV columns):
{search_context}

Initial Source CSV Content (Progress):
{initial_csv_content}

Current Target CSV Content (Progress:):
{current_csv_content}

Task: 
Select the next batch of files ( up to 15) that are most likely to contain information to fill the MISSING or LOW CONFIDENCE parts of the 
current CSV. Do not select files that are alrady processed.set

You can also provide search queries to find relevant information in the documentation.
- "search_queries": List of natural language queries for semantic vector search (approx 300 chars max).
- "keywords": List of specific terms or codes (approx 50 items max) for full-text and fuzzy search. 

If you believe you have found all necessary information or if no remaining files seem relevant, you can stop the process.

Return a JSON object with these keys:
1. "files": A list of selected file paths.
2. "thoughts": A brief explanation of why these files were selected and what you are looking for.
3. "search_queries": A list of strings for semantic search.
4. "keywords": A list of strings for keyword/fuzzy search. 
5. "done": A boolean (true/false). Set to true if you are finished and no more files are needed.

Example:
{{
  "files": ["path/to/file1.txt", "path/to/file2.txt"],
  "thoughts": "Selected IIM and ORD schemas as they likely contain item and order related fields missing in the current CSV.",
  "search_queries": ["item details", "order processing", "inventory management"],
  "keywords": ["IIM", "ORD", "item number", "order date"],
  "done": false
}} 
"""
        
        return self._generate(prompt)

