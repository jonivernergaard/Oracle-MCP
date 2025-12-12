import os
from google import genai
from dotenv import load_dotenv

load_dotenv("config.env")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not found.")
    exit(1)

client = genai.Client(api_key=GEMINI_API_KEY)

print("Testing gemini-3-pro-preview...")
try:
    response = client.models.generate_content(
        model="gemini-3-pro-preview",
        contents="Hello, are you working?",
    )
    print("Success!")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
