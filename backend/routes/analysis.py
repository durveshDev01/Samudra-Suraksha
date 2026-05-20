"""
backend/routes/analysis.py
---------------------------
Tweet NLP analysis route.
Calls Gemini AI server-side — API key never reaches the browser.
Also handles tweet spike detection for auto-draft alerts.
"""
import logging
import time
from collections import defaultdict
from flask import Blueprint, request, jsonify

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.gemini_service import analyze_batch

analysis_bp = Blueprint("analysis", __name__)
logger = logging.getLogger(__name__)

# --- Spike Detection ---
# Stores rolling tweet counts per (hazard, region) in 30-minute windows
# Format: {(hazard, region): [(timestamp, count), ...]}
_spike_tracker: dict = defaultdict(list)
_SPIKE_WINDOW_SECONDS = 1800   # 30 minutes
_SPIKE_THRESHOLD_PERCENT = 200  # 200% increase = 3x baseline


def _record_and_check_spike(hazard: str, region: str, count: int) -> bool:
    """
    Record tweet count and check if a spike has occurred.
    Returns True if a spike is detected (current count > 3x 30-min average).
    """
    now = time.time()
    key = (hazard, region)
    _spike_tracker[key].append((now, count))

    # Trim old data outside window
    _spike_tracker[key] = [
        (ts, c) for ts, c in _spike_tracker[key]
        if now - ts <= _SPIKE_WINDOW_SECONDS
    ]

    entries = _spike_tracker[key]
    if len(entries) < 3:
        return False  # Need at least 3 data points

    # Calculate baseline (all but the latest entry)
    baseline_counts = [c for _, c in entries[:-1]]
    baseline_avg = sum(baseline_counts) / len(baseline_counts)
    latest = entries[-1][1]

    if baseline_avg > 0:
        increase_pct = ((latest - baseline_avg) / baseline_avg) * 100
        if increase_pct >= _SPIKE_THRESHOLD_PERCENT:
            logger.warning(f"SPIKE DETECTED: {hazard}/{region} — {increase_pct:.0f}% increase")
            return True
    return False


@analysis_bp.route("/api/analyze-tweets", methods=["POST"])
def analyze_tweets():
    """
    Accepts a batch of raw tweets and returns Gemini-classified results.
    
    Body: { "tweets": [ { "content": "...", "metadata": {...} }, ... ] }
    Returns: { "results": [ { ...tweet, category, hazard_type, confidence, ... } ] }
    """
    body = request.get_json(silent=True)
    if not body or "tweets" not in body:
        return jsonify({"error": "Request must include a 'tweets' array"}), 400

    tweets = body["tweets"]
    if not isinstance(tweets, list) or len(tweets) == 0:
        return jsonify({"error": "tweets must be a non-empty array"}), 400

    # Cap batch size to avoid overload
    tweets = tweets[:30]

    logger.info(f"Analyzing batch of {len(tweets)} tweets")
    try:
        results = analyze_batch(tweets)

        # --- Spike detection ---
        spikes = []
        from collections import Counter
        hazard_region_counts = Counter(
            (r.get("hazard_type", "other"), r.get("location", "Unknown"))
            for r in results
        )
        for (hazard, region), count in hazard_region_counts.items():
            if hazard in ("flood", "tsunami", "storm") and region != "Unknown":
                if _record_and_check_spike(hazard, region, count):
                    spikes.append({
                        "hazard": hazard,
                        "region": region,
                        "tweet_count": count,
                        "message": f"Spike detected: {count} {hazard} tweets from {region} in last batch"
                    })

        return jsonify({
            "results": results,
            "spikes": spikes,
            "analyzed_count": len(results)
        })

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return jsonify({"error": str(e)}), 500
