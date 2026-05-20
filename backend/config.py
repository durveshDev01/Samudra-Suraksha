"""
backend/config.py
-----------------
Central configuration loaded from environment variables.
Never hardcode secrets here — all values come from backend/.env
"""
import os
from dotenv import load_dotenv

# Load .env from the backend directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

# --- Gopher API (Twitter) ---
GOPHER_API_URL    = os.getenv("GOPHER_API_URL", "https://data.gopher-ai.com/api/v1/search/live/twitter")
GOPHER_AUTH_TOKEN = os.getenv("GOPHER_AUTH_TOKEN", "")

# --- Google Gemini ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
GEMINI_URL     = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

# --- Supabase ---
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# --- Firebase FCM ---
FIREBASE_SERVICE_ACCOUNT_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "backend/firebase_service_account.json")
FCM_DEFAULT_TOPIC             = os.getenv("FCM_DEFAULT_TOPIC", "gov_alerts")

# --- Flask ---
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")
FLASK_DEBUG      = os.getenv("FLASK_ENV", "production") == "development"
