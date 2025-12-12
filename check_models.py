from google import genai
import os
from dotenv import load_dotenv

load_dotenv("config.env")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("Listing available models...")
try:
    for m in client.models.list():
        if "gemini" in m.name:
            print(f"- {m.name}")
except Exception as e:
    print(f"Error listing models: {e}")
