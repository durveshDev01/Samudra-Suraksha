"""
backend/services/gemini_service.py
------------------------------------
Server-side Gemini AI analysis service.
Classifies tweets for hazard type, urgency, category, and misinformation.
Gemini API key is NEVER exposed to the browser.
"""
import json
import logging
import requests
from functools import lru_cache
import hashlib

# Import config from parent package
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import GEMINI_URL

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE = """You are an expert coastal hazard analyst for the Indian government (INCOIS).
Classify the following social media post (may be in English, Hindi, Tamil, Telugu, or Malayalam).
Translate internally if needed.

Classify into ONE category:
- Emergency/Alert: Immediate danger, people in peril, evacuation needed
- Observation/Neutral Report: Factual info without panic
- Panic/Fear: Expressions of fear, confusion, or exaggeration
- Awareness/Official Info: Sharing warnings, official updates, or advice

Extract:
- hazard_type: one of [flood, tsunami, waves, erosion, storm, other]
- location: city/village/state if mentioned, else "Unknown"
- hashtags: array of #tags found
- confidence: float 0.0-1.0 indicating classification confidence
- misinfo_flag: true if contains exaggeration or false claims (bool)
- misinfo_reason: brief reason if flagged, else empty string

Respond ONLY in valid JSON with this exact structure:
{
  "category": "Category Name",
  "hazard_type": "hazard",
  "location": "Extracted Location",
  "hashtags": ["#tag1"],
  "confidence": 0.95,
  "misinfo_flag": false,
  "misinfo_reason": ""
}

Post: "{{TWEET_TEXT}}"
Metadata: Timestamp: {{TIMESTAMP}}, Geo: {{GEO}}, User: {{USER}}"""


def _cache_key(text: str) -> str:
    """Create a stable cache key from tweet text."""
    return hashlib.md5(text.encode()).hexdigest()


# In-memory cache: tweet hash → analysis result (avoids re-calling Gemini for identical tweets)
_analysis_cache: dict = {}


def analyze_tweet(tweet: dict) -> dict:
    """
    Analyze a single tweet using Gemini API.
    Returns structured classification result.
    Caches results to avoid redundant API calls.
    """
    content = tweet.get("content", "No content")
    cache_key = _cache_key(content)

    # Return cached result if available
    if cache_key in _analysis_cache:
        logger.debug(f"Cache hit for tweet: {content[:40]}")
        return _analysis_cache[cache_key]

    prompt = PROMPT_TEMPLATE \
        .replace("{{TWEET_TEXT}}", content.replace('"', '\\"')) \
        .replace("{{TIMESTAMP}}", tweet.get("metadata", {}).get("created_at", "Unknown")) \
        .replace("{{GEO}}", str(tweet.get("metadata", {}).get("geo", {}).get("coordinates", "No geo"))) \
        .replace("{{USER}}", tweet.get("metadata", {}).get("username", "Unknown"))

    try:
        response = requests.post(
            GEMINI_URL,
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "response_mime_type": "application/json"
                }
            },
            timeout=15
        )
        response.raise_for_status()
        raw_text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        clean_text = raw_text.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean_text)

        # Validate required fields
        result.setdefault("category", "Observation/Neutral Report")
        result.setdefault("hazard_type", "other")
        result.setdefault("location", "Unknown")
        result.setdefault("hashtags", [])
        result.setdefault("confidence", 0.8)
        result.setdefault("misinfo_flag", False)
        result.setdefault("misinfo_reason", "")

    except Exception as e:
        logger.warning(f"Gemini analysis failed: {e}. Using keyword fallback.")
        result = _keyword_fallback(content)

    _analysis_cache[cache_key] = result
    return result


def analyze_batch(tweets: list) -> list:
    """Analyze a list of tweets. Returns list of enriched tweet dicts."""
    results = []
    for tweet in tweets:
        analysis = analyze_tweet(tweet)
        results.append({**tweet, **analysis})
    return results


def _keyword_fallback(content: str) -> dict:
    """Rule-based fallback when Gemini is unavailable."""
    lower = content.lower()

    # Category
    if any(w in lower for w in ["help", "evacuate", "danger", "emergency", "mayday"]):
        category = "Emergency/Alert"
    elif any(w in lower for w in ["fear", "scared", "panic", "!!!"]):
        category = "Panic/Fear"
    elif any(w in lower for w in ["alert", "warning", "official", "incois"]):
        category = "Awareness/Official Info"
    else:
        category = "Observation/Neutral Report"

    # Hazard
    hazard_keywords = {
        "flood":   ["flood", "flooding", "inundation", "बाढ़", "வெள்ளம்", "వరద", "വെള്ളപ്പൊക്കം"],
        "tsunami": ["tsunami", "tidal wave", "सुनामी", "சுனாமி", "సునామీ", "സുനാമി"],
        "waves":   ["wave", "swell", "high wave", "surge"],
        "erosion": ["erosion", "coastal erosion", "कटाव"],
        "storm":   ["storm", "cyclone", "hurricane", "तूफान", "புயல்", "తుఫాను", "കൊടുങ്കാറ്റ്"]
    }
    hazard = "other"
    for h, words in hazard_keywords.items():
        if any(w in lower for w in words):
            hazard = h
            break

    misinfo = (any(w in lower for w in ["everyone", "all gone", "all dead"]) or
               (any(w in lower for w in ["dead", "died"]) and bool(__import__("re").search(r"\d{4,}", content))))

    return {
        "category":      category,
        "hazard_type":   hazard,
        "location":      "Unknown",
        "hashtags":      __import__("re").findall(r"#\w+", content),
        "confidence":    0.5,
        "misinfo_flag":  misinfo,
        "misinfo_reason": "High numerical claims or extreme language detected" if misinfo else ""
    }
