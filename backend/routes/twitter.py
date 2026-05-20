"""
backend/routes/twitter.py
--------------------------
Real-time coastal hazard intelligence via Google News RSS.
- Google News RSS is free, no API key, updated in real-time
- Gemini AI analyzes each article for hazard type, urgency, sentiment
- Falls back to keyword analysis if Gemini unavailable
- Demo data used only if all feeds fail
"""
import logging
import time
import uuid
import threading
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

import feedparser
import requests
from flask import Blueprint, request, jsonify

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import GEMINI_API_KEY

twitter_bp = Blueprint("twitter", __name__)
logger = logging.getLogger(__name__)

# ── In-memory job store ──────────────────────────────────────────────────────
_jobs: dict = {}

# ── Indian coastal states for geo-tagging ───────────────────────────────────
COASTAL_STATES = {
    "KERALA":          (10.8505, 76.2711),
    "TAMIL NADU":      (11.1271, 78.6569),
    "ANDHRA PRADESH":  (15.9129, 79.7400),
    "ODISHA":          (20.9517, 85.0985),
    "WEST BENGAL":     (22.9868, 87.8550),
    "GUJARAT":         (22.2587, 71.1924),
    "MAHARASHTRA":     (19.7515, 75.7139),
    "GOA":             (15.2993, 74.1240),
    "KARNATAKA":       (15.3173, 75.7139),
    "LAKSHADWEEP":     (10.5667, 72.6417),
    "ANDAMAN":         (11.7401, 92.6586),
    "PUDUCHERRY":      (11.9416, 79.8083),
}

# ── Default queries covering Indian coastal hazards ──────────────────────────
DEFAULT_QUERIES = [
    "flood india coastal",
    "cyclone india warning",
    "tsunami india alert",
    "INCOIS wave alert india",
    "IMD coastal warning india",
]


def _extract_region(text: str) -> tuple:
    """Return (region_name, (lat, lng)) from text."""
    upper = text.upper()
    for state, coords in COASTAL_STATES.items():
        if state in upper:
            return state, coords
    return "INDIA", (20.5937, 78.9629)


def _keyword_analyze(text: str) -> dict:
    """Fast rule-based fallback analysis."""
    lower = text.lower()

    hazard = "other"
    for h, words in {
        "flood":   ["flood", "inundation", "waterlogging", "बाढ़"],
        "tsunami": ["tsunami", "tidal wave", "सुनामी"],
        "storm":   ["cyclone", "storm", "hurricane", "तूफान"],
        "waves":   ["wave", "surge", "swell", "high sea"],
        "erosion": ["erosion", "coastal erosion"],
    }.items():
        if any(w in lower for w in words):
            hazard = h
            break

    urgency = "low"
    if any(w in lower for w in ["emergency", "evacuate", "danger", "rescue", "red alert", "sos"]):
        urgency = "high"
    elif any(w in lower for w in ["warning", "alert", "watch", "cyclone", "tsunami", "heavy rain"]):
        urgency = "medium"

    sentiment = "neutral"
    if any(w in lower for w in ["safe", "relief", "rescued", "restored", "recede"]):
        sentiment = "positive"
    elif any(w in lower for w in ["dead", "death", "damage", "loss", "crisis", "fear", "panic", "stranded"]):
        sentiment = "negative"

    category = "Observation/Neutral Report"
    if urgency == "high":
        category = "Emergency/Alert"
    elif any(w in lower for w in ["official", "incois", "imd", "ndrf", "government", "ministry"]):
        category = "Awareness/Official Info"

    region, coords = _extract_region(text)
    return {
        "hazard_type":     hazard,
        "urgency":         urgency,
        "sentiment":       sentiment,
        "category":        category,
        "confidence":      0.62,
        "misinfo_flag":    False,
        "misinfo_reason":  "",
        "location_region": region,
        "hashtags":        re.findall(r"#\w+", text),
        "_coords":         coords,
    }


def _gemini_analyze(text: str) -> Optional[dict]:
    """Analyze with Gemini AI. Returns None on failure."""
    if not GEMINI_API_KEY or GEMINI_API_KEY.strip() == "":
        return None
    try:
        prompt = f"""You are a coastal hazard analyst for INCOIS India.
Analyze this Indian news headline/article in JSON only:
{{
  "hazard_type": "flood|tsunami|waves|erosion|storm|other",
  "urgency": "high|medium|low",
  "sentiment": "positive|neutral|negative",
  "category": "Emergency/Alert|Observation/Neutral Report|Panic/Fear|Awareness/Official Info",
  "location_region": "STATE NAME IN CAPS (e.g. KERALA) or INDIA",
  "confidence": 0.0-1.0,
  "misinfo_flag": false,
  "misinfo_reason": ""
}}

Text: \"{text[:500]}\""""

        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"}
            },
            timeout=10
        )
        resp.raise_for_status()
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        clean = raw.replace("```json", "").replace("```", "").strip()
        result = __import__("json").loads(clean)

        # Add coordinates from location_region
        region = result.get("location_region", "INDIA").upper()
        coords = COASTAL_STATES.get(region, (20.5937, 78.9629))
        result["_coords"] = coords
        return result
    except Exception as e:
        logger.debug(f"Gemini analysis failed: {e}")
        return None


def _build_google_news_url(query: str) -> str:
    """Build a Google News RSS URL for the given query."""
    encoded = urllib.parse.quote(query)
    return f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"


def _fetch_and_analyze(job_uuid: str, query: str, max_results: int):
    """Background worker: fetch from Google News RSS, analyze with Gemini."""
    results = []
    seen_titles = set()

    # Build targeted queries from user input
    if query and query.strip():
        # Add India context if not present
        search_terms = query if "india" in query.lower() else f"{query} india"
        feed_urls = [_build_google_news_url(search_terms)]
    else:
        # Default: load multiple coastal hazard topics
        feed_urls = [_build_google_news_url(q) for q in DEFAULT_QUERIES]

    for feed_url in feed_urls:
        if len(results) >= max_results:
            break
        try:
            logger.info(f"Fetching RSS: {feed_url[:80]}")
            feed = feedparser.parse(feed_url)

            entries = feed.entries if hasattr(feed, 'entries') else []
            logger.info(f"RSS returned {len(entries)} entries")

            for entry in entries:
                if len(results) >= max_results:
                    break

                title   = entry.get("title", "").strip()
                summary = entry.get("summary", entry.get("description", "")).strip()
                link    = entry.get("link", "")

                # Clean HTML from summary
                summary = re.sub(r"<[^>]+>", " ", summary).strip()
                full_text = f"{title}. {summary}"

                # Skip duplicates
                if title in seen_titles or len(title) < 10:
                    continue
                seen_titles.add(title)

                # Parse date
                published = entry.get("published_parsed") or entry.get("updated_parsed")
                if published:
                    try:
                        pub_dt = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
                    except Exception:
                        pub_dt = datetime.now(timezone.utc).isoformat()
                else:
                    pub_dt = datetime.now(timezone.utc).isoformat()

                # Source name from feed
                source_name = (feed.feed.get("title", "News") if hasattr(feed, 'feed') else "News")
                source_name = source_name[:40]

                # Analyze with Gemini first, then keyword fallback
                analysis = _gemini_analyze(full_text) or _keyword_analyze(full_text)
                coords = analysis.pop("_coords", (20.5937, 78.9629))

                import random
                lat = coords[0] + random.uniform(-0.8, 0.8)
                lng = coords[1] + random.uniform(-0.8, 0.8)

                article = {
                    "id":              str(uuid.uuid4()),
                    "content":         f"{title}. {summary[:300]}".strip(),
                    "username":        source_name,
                    "source":          "news",
                    "created_at":      pub_dt,
                    "url":             link,
                    "retweet_count":   0,
                    "like_count":      0,
                    "reply_count":     0,
                    "lat":             lat,
                    "lng":             lng,
                    **analysis,
                }
                results.append(article)
                time.sleep(0.05)  # gentle Gemini rate limit

        except Exception as e:
            logger.warning(f"Feed error ({feed_url[:60]}): {e}")
            continue

    if not results:
        logger.warning(f"No results from RSS — using demo data for job {job_uuid}")
        results = _demo_data(query)

    _jobs[job_uuid] = {"status": "done", "results": results}
    logger.info(f"Job {job_uuid} complete: {len(results)} articles")


def _demo_data(query: str) -> list:
    """Realistic demo data when all feeds fail."""
    return [
        {
            "id": str(uuid.uuid4()),
            "content": "INCOIS issues high wave alert for Kerala coast. Fishermen advised not to venture into sea due to rough conditions. IMD cyclone watch active.",
            "username": "INCOIS_Official", "source": "demo",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "hazard_type": "waves", "urgency": "high", "sentiment": "neutral",
            "category": "Awareness/Official Info", "confidence": 0.92,
            "location_region": "KERALA", "lat": 10.85, "lng": 76.27,
            "misinfo_flag": False, "misinfo_reason": "", "hashtags": ["#Kerala", "#CoastalAlert"],
            "retweet_count": 0, "like_count": 0, "reply_count": 0, "url": "",
        },
        {
            "id": str(uuid.uuid4()),
            "content": "IMD predicts low pressure area in Bay of Bengal. Tamil Nadu and Andhra Pradesh coasts on cyclone watch. Fishermen warned to stay ashore.",
            "username": "IMD_WeatherIndia", "source": "demo",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "hazard_type": "storm", "urgency": "medium", "sentiment": "neutral",
            "category": "Awareness/Official Info", "confidence": 0.88,
            "location_region": "TAMIL NADU", "lat": 11.13, "lng": 78.66,
            "misinfo_flag": False, "misinfo_reason": "", "hashtags": ["#Cyclone", "#IMD"],
            "retweet_count": 0, "like_count": 0, "reply_count": 0, "url": "",
        },
        {
            "id": str(uuid.uuid4()),
            "content": "Coastal flooding reported in Odisha. NDRF teams deployed. Residents in low-lying areas being evacuated. Three districts on red alert.",
            "username": "NDRF_Official", "source": "demo",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "hazard_type": "flood", "urgency": "high", "sentiment": "negative",
            "category": "Emergency/Alert", "confidence": 0.94,
            "location_region": "ODISHA", "lat": 20.95, "lng": 85.09,
            "misinfo_flag": False, "misinfo_reason": "", "hashtags": ["#OdishaFlood", "#NDRF"],
            "retweet_count": 0, "like_count": 0, "reply_count": 0, "url": "",
        },
    ]


# ── Routes ───────────────────────────────────────────────────────────────────

@twitter_bp.route("/api/twitter/search", methods=["POST"])
def twitter_search():
    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()
    max_results = min(int(data.get("max_results", 20)), 50)

    job_uuid = str(uuid.uuid4())
    _jobs[job_uuid] = {"status": "pending", "results": []}

    t = threading.Thread(
        target=_fetch_and_analyze,
        args=(job_uuid, query, max_results),
        daemon=True
    )
    t.start()

    logger.info(f"Started job {job_uuid} query='{query[:50]}'")
    return jsonify({"jobUUID": job_uuid})


@twitter_bp.route("/api/twitter/result/<job_uuid>", methods=["GET"])
def twitter_result(job_uuid):
    job = _jobs.get(job_uuid)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if job["status"] == "pending":
        return jsonify({"status": "pending", "results": []})

    results = job.get("results", [])

    # Prune old jobs (keep last 100)
    if len(_jobs) > 100:
        oldest = list(_jobs.keys())[0]
        _jobs.pop(oldest, None)

    return jsonify({"status": "done", "results": results, "count": len(results)})
