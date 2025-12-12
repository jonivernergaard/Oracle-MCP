import pandas as pd
import os

file_path = "BPCS Tables metadata.xlsx"

try:
    df = pd.read_excel(file_path)
    print("Columns:", df.columns.tolist())
    print(df.head().to_string())
except Exception as e:
    print(f"Error reading excel: {e}")
