"""
backend/services/fcm_service.py
---------------------------------
Firebase Cloud Messaging (FCM) service using firebase-admin SDK.
Sends real push notifications to subscribed government officer devices.

Setup:
  1. Go to Firebase Console → Project Settings → Service Accounts
  2. Click "Generate new private key" → download JSON
  3. Save it to the path in FIREBASE_SERVICE_ACCOUNT_PATH (.env)
"""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import FIREBASE_SERVICE_ACCOUNT_PATH, FCM_DEFAULT_TOPIC

logger = logging.getLogger(__name__)

# Lazy-init Firebase app (only once)
_firebase_initialized = False
_firebase_available = False


def _init_firebase():
    global _firebase_initialized, _firebase_available
    if _firebase_initialized:
        return _firebase_available

    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            cred_path = os.path.abspath(FIREBASE_SERVICE_ACCOUNT_PATH)
            if not os.path.exists(cred_path):
                logger.warning(
                    f"Firebase service account not found at '{cred_path}'. "
                    "FCM notifications will be disabled. "
                    "Download serviceAccountKey.json from Firebase Console."
                )
                _firebase_initialized = True
                _firebase_available = False
                return False

            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully.")

        _firebase_available = True
    except ImportError:
        logger.warning("firebase-admin not installed. Run: pip install firebase-admin")
        _firebase_available = False
    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        _firebase_available = False

    _firebase_initialized = True
    return _firebase_available


def send_topic_notification(title: str, body: str, data: dict = None, topic: str = None) -> dict:
    """
    Send a push notification to all subscribers of a topic.
    
    Args:
        title:  Notification title
        body:   Notification body
        data:   Optional key-value payload (all values must be strings)
        topic:  FCM topic (defaults to FCM_DEFAULT_TOPIC from .env)
    
    Returns:
        dict with 'success': bool and 'message_id' or 'error'
    """
    if not _init_firebase():
        logger.warning("FCM not available — notification not sent.")
        return {
            "success": False,
            "error": "Firebase not configured. Add firebase_service_account.json and restart."
        }

    try:
        from firebase_admin import messaging

        target_topic = topic or FCM_DEFAULT_TOPIC

        # Ensure all data values are strings (FCM requirement)
        str_data = {k: str(v) for k, v in (data or {}).items()}

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=str_data,
            topic=target_topic,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    sound="default",
                    channel_id="hazard_alerts"
                )
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default", badge=1)
                )
            )
        )

        message_id = messaging.send(message)
        logger.info(f"FCM notification sent. message_id={message_id}, topic={target_topic}")
        return {"success": True, "message_id": message_id, "topic": target_topic}

    except Exception as e:
        logger.error(f"FCM send failed: {e}")
        return {"success": False, "error": str(e)}


def send_multicast_notification(title: str, body: str, tokens: list, data: dict = None) -> dict:
    """
    Send notification to specific device tokens (for targeted alerts).
    
    Args:
        tokens: List of FCM device registration tokens
        title, body, data: same as send_topic_notification
    """
    if not _init_firebase():
        return {"success": False, "error": "Firebase not configured."}

    if not tokens:
        return {"success": False, "error": "No device tokens provided."}

    try:
        from firebase_admin import messaging

        str_data = {k: str(v) for k, v in (data or {}).items()}

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data=str_data,
            tokens=tokens,
            android=messaging.AndroidConfig(priority="high")
        )

        response = messaging.send_each_for_multicast(message)
        logger.info(f"Multicast sent: {response.success_count} success, {response.failure_count} failures")
        return {
            "success": response.success_count > 0,
            "success_count": response.success_count,
            "failure_count": response.failure_count
        }

    except Exception as e:
        logger.error(f"FCM multicast failed: {e}")
        return {"success": False, "error": str(e)}
