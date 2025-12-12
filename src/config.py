import os

#base directory
BASE_DATA_DIR = os.getenv('DATA_STORAGE_PATH', '.') # setting main data directory

FBDI_TEMPLATE_DIR = os.path.join(BASE_DATA_DIR, 'FBDI Template') # dynamically discover csv files here
BPCS_DATA_DIR = os.path.join(BASE_DATA_DIR, 'BPCS Data') # The raw legacy documentation CSVs
BPCS_DB_PATH = os.path.join(BASE_DATA_DIR, 'Database', 'vector_store.db') # The vector database file
PROCESSED_DIR = os.path.join(BASE_DATA_DIR, 'Mapped CSV') #This is where the mapped csv files will go
TABLES_DESCRIPTIONS_PATH = os.path.join(BASE_DATA_DIR, 'bpcs_table_descriptions.json') # table description