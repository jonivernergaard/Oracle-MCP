import streamlit as st
import os
import pandas as pd
import subprocess
import glob
from dotenv import load_dotenv

# Load environment variables
load_dotenv("config.env")

# Page Config
st.set_page_config(
    page_title="Accenture AI Data Mapper",
    page_icon="🟣",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for Accenture Theme & Terminal Look
st.markdown("""
    <style>
    .stApp {
        background-color: #1e1e1e;
        color: #ffffff;
    }
    .stButton>button {
        background-color: #A100FF;
        color: white;
        border-radius: 5px;
        border: none;
        padding: 10px 24px;
        font-weight: bold;
    }
    .stButton>button:hover {
        background-color: #8a00d4;
        border: 1px solid #ffffff;
    }
    .terminal-box {
        background-color: #1e1e1e;
        color: #00ff00;
        font-family: 'Courier New', Courier, monospace;
        padding: 15px;
        border-radius: 5px;
        border: 1px solid #333;
        height: 400px;
        overflow-y: auto;
        white-space: pre-wrap;
    }
    h1, h2, h3 {
        color: #ffffff !important;
    }
    .accenture-purple {
        color: #A100FF;
    }
    </style>
""", unsafe_allow_html=True)

# --- Sidebar ---
with st.sidebar:
    st.image("https://upload.wikimedia.org/wikipedia/commons/c/cd/Accenture.svg", width=150)
    st.markdown("### AI Data Mapping Tool")
    st.markdown("---")
    
    # API Key Status
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        masked_key = f"{api_key[:4]}...{api_key[-4:]}"
        st.success(f"🔑 Gemini API Key Active\n\n`{masked_key}`")
    else:
        st.error("❌ Gemini API Key Missing")
        
    st.markdown("---")
    st.markdown("### 📂 Workspace Info")
    
    # List FBDI Templates
    st.markdown("**FBDI Templates:**")
    fbdi_files = glob.glob("FBDI Template/*.csv")
    if fbdi_files:
        for f in fbdi_files:
            st.code(os.path.basename(f), language="text")
    else:
        st.warning("No FBDI templates found.")

    # List BPCS Docs
    st.markdown("**BPCS Schemas:**")
    bpcs_files = glob.glob("BPCS/*.csv")
    if bpcs_files:
        st.caption(f"Found {len(bpcs_files)} schema files")
        with st.expander("View Schema List"):
            for f in bpcs_files:
                st.text(os.path.basename(f))
    else:
        st.warning("No BPCS documentation found.")

# --- Main Content ---
st.markdown("# 🟣 Accenture <span style='color:white'>AI Data Mapper</span>", unsafe_allow_html=True)
st.markdown("Automated mapping of Oracle FBDI fields to Legacy BPCS schemas using Gemini 2.5 Flash.")

# Initialize session state for terminal logs
if 'terminal_logs' not in st.session_state:
    st.session_state['terminal_logs'] = ""

col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("🚀 Execution Control")
    
    if st.button("▶️ Run Mapper v2", use_container_width=True):
        st.session_state['terminal_logs'] = "" # Clear previous logs
        
        st.markdown("### 📟 Terminal Output")
        terminal_placeholder = st.empty()
        
        st.markdown("### ⏳ Live Mapping Progress")
        live_table_placeholder = st.empty()
        
        output_buffer = []
        
        # Run the script as a subprocess
        # Use sys.executable to ensure we use the same python interpreter as the streamlit app
        import sys
        process = subprocess.Popen(
            [sys.executable, "-u", "mapper_v2.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding='utf-8' 
        )
        
        # Stream output
        line_count = 0
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                output_buffer.append(line)
                st.session_state['terminal_logs'] = "".join(output_buffer)
                # Update the terminal box
                terminal_placeholder.markdown(f'<div class="terminal-box">{st.session_state["terminal_logs"]}</div>', unsafe_allow_html=True)
                
                line_count += 1
                # Update live table every few lines to avoid file locking issues and excessive updates
                if line_count % 2 == 0:
                    try:
                        progress_csv_path = os.path.join("Mapped CSV", "mapping_in_progress.csv")
                        if os.path.exists(progress_csv_path):
                            df_live = pd.read_csv(progress_csv_path)
                            # Filter to show only rows that have been processed (have a decision)
                            df_mapped = df_live[df_live['Legacy Table Name'].notna()]
                            if not df_mapped.empty:
                                live_table_placeholder.dataframe(df_mapped, height=300, use_container_width=True)
                    except Exception:
                        pass # Ignore read errors during write operations
        
        if process.returncode == 0:
            st.success("✅ Mapping Process Completed Successfully!")
        else:
            st.error("❌ Process failed with errors.")
    
    # Always display the terminal logs if they exist (persists across re-runs)
    elif st.session_state['terminal_logs']:
        st.markdown("### 📟 Terminal Output")
        st.markdown(f'<div class="terminal-box">{st.session_state["terminal_logs"]}</div>', unsafe_allow_html=True)

with col2:
    st.subheader("📊 Recent Mappings")
    mapped_files = sorted(glob.glob("Mapped CSV/Final_Mapping_*.csv"), reverse=True)
    
    if mapped_files:
        selected_file = st.selectbox("Select Output File", mapped_files, format_func=lambda x: os.path.basename(x))
        
        if selected_file:
            df = pd.read_csv(selected_file)
            st.dataframe(df, height=400)
            
            with open(selected_file, "rb") as f:
                st.download_button(
                    label="⬇️ Download CSV",
                    data=f,
                    file_name=os.path.basename(selected_file),
                    mime="text/csv",
                    use_container_width=True
                )
    else:
        st.info("No mapped files generated yet.")

# Footer
st.markdown("---")
st.markdown("<center>Designed for Huhtamaki OYJ | Powered by Accenture AI</center>", unsafe_allow_html=True)
