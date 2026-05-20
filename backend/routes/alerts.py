"""
backend/routes/alerts.py
--------------------------
Government alert routes — FCM push notification dispatch.
"""
import logging
from flask import Blueprint, request, jsonify

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.fcm_service import send_topic_notification, send_multicast_notification

alerts_bp = Blueprint("alerts", __name__)
logger = logging.getLogger(__name__)


@alerts_bp.route("/api/send-fcm-alert", methods=["POST"])
def send_fcm_alert():
    """
    Send a real FCM push notification for a government alert.
    
    Body:
    {
        "title": "Alert title",
        "description": "Alert body text",
        "severity": "emergency|high|medium|low",
        "target_region": "Kerala",        // optional
        "tokens": ["device_token_1", ...] // optional, uses topic if absent
    }
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Invalid JSON body"}), 400

    title = body.get("title", "").strip()
    description = body.get("description", "").strip()
    severity = body.get("severity", "medium")
    region = body.get("target_region", "All Regions")
    tokens = body.get("tokens", [])

    if not title or not description:
        return jsonify({"error": "title and description are required"}), 400

    # Extra data payload (stringified for FCM)
    data_payload = {
        "severity": severity,
        "region": region,
        "type": "coastal_hazard_alert"
    }

    emoji_map = {
        "emergency": "🚨",
        "high": "⚠️",
        "medium": "📢",
        "low": "ℹ️"
    }
    formatted_title = f"{emoji_map.get(severity, '📢')} {title}"
    formatted_body = f"[{severity.upper()}] {region}: {description}"

    if tokens:
        result = send_multicast_notification(
            title=formatted_title,
            body=formatted_body,
            tokens=tokens,
            data=data_payload
        )
    else:
        result = send_topic_notification(
            title=formatted_title,
            body=formatted_body,
            data=data_payload
        )

    if result.get("success"):
        logger.info(f"Alert dispatched: '{title}' severity={severity}")
        return jsonify({"success": True, "fcm_result": result})
    else:
        logger.error(f"Alert dispatch failed: {result.get('error')}")
        # Return 200 still — alert was saved in DB, just FCM failed
        return jsonify({
            "success": False,
            "fcm_result": result,
            "note": "Alert saved in database but push notification failed. Check Firebase config."
        }), 200
