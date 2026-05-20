"""
app.py  (project root — entry point)
--------------------------------------
Refactored Flask application using Blueprints.
All API secrets are loaded from backend/.env — never hardcoded here.
"""
import logging
import os
from flask import Flask, send_from_directory
from flask_cors import CORS

# ── Bootstrap path so backend package is importable ─────────────────────────
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from backend.config import FLASK_DEBUG, FLASK_SECRET_KEY
from backend.routes.twitter  import twitter_bp
from backend.routes.analysis import analysis_bp
from backend.routes.alerts   import alerts_bp

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if FLASK_DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s"
)
logger = logging.getLogger(__name__)

# ── App factory ───────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=".", static_url_path="")
app.secret_key = FLASK_SECRET_KEY

# Allow CORS for frontend requests (restrict origins in production)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Register blueprints ───────────────────────────────────────────────────────
app.register_blueprint(twitter_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(alerts_bp)

# ── Static file serving (dashboard HTML, JS, assets) ─────────────────────────
@app.route("/")
def index():
    return send_from_directory(".", "auth.html")

@app.route("/dashboard")
def dashboard():
    return send_from_directory(".", "samudradashboard.html")

@app.route("/<path:filename>")
def serve_static(filename):
    # Security: prevent path traversal
    safe_path = os.path.normpath(filename)
    if safe_path.startswith(".."):
        return "Forbidden", 403
    return send_from_directory(".", safe_path)

# ── Health check ──────────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    return {"status": "ok", "service": "Samudra Suraksha API"}, 200

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("Starting Samudra Suraksha API server...")
    app.run(debug=FLASK_DEBUG, host="0.0.0.0", port=5000)