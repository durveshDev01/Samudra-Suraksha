# 🌊 Samudra Suraksha — AI-Powered Coastal Hazard Monitoring & Early Warning System

> **An intelligent coastal safety platform for government disaster management authorities (INCOIS).**  
> Aggregates real-time hazard reports, monitors social media using NLP, and provides actionable insights and early warnings for coastal threats.

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Setup & Installation](#-setup--installation)
- [Environment Variables](#-environment-variables)
- [Database Setup (Supabase)](#-database-setup-supabase)
- [Running the Application](#-running-the-application)
- [API Endpoints](#-api-endpoints)
- [Project Structure](#-project-structure)
- [Security Notes](#-security-notes)

---

## ✨ Features

| Feature | Description |
|---|---|
| **Real-time Dashboard** | Monitor coastal hazard reports with live Supabase subscriptions |
| **Interactive Maps** | Leaflet.js with heatmaps, clustering, and hazard-type markers |
| **Social Media Intelligence** | Twitter monitoring via Gopher API with multi-language keyword detection |
| **AI-Powered NLP** | Google Gemini classifies tweets by hazard type, urgency, category, and misinformation |
| **Government Alerts** | Create, send, and track alerts with real FCM push notifications |
| **Report Management** | Verify/reject citizen reports with full audit trail |
| **Spike Detection** | Auto-detects sudden surges in social media activity per hazard/region |
| **Analytics** | Chart.js dashboards with trend lines, pie charts, and comparison bars |
| **Coastal Info** | DataTables-powered coastal region information explorer |
| **CSV Export** | Export filtered reports as CSV |
| **Audit Logging** | Every officer action (verify, reject, delete) is logged to `audit_log` |
| **XSS Protection** | DOMPurify sanitizes all user-generated content before DOM injection |

---

## 🏗️ Architecture

```
Browser (Officers)
    │
    ├── auth.html ──────────── Supabase Auth (login/signup)
    │
    └── samudradashboard.html ─┬─ dashboard33.js  (reports, maps, alerts, charts)
                               ├─ social.js       (Twitter + Gemini NLP)
                               └─ coastalinfo.js  (coastal data explorer)
                                    │
                                    ▼
                             Flask API (app.py)
                               ├─ /api/twitter/*        ─── Gopher API proxy
                               ├─ /api/analyze-tweets   ─── Gemini AI (server-side)
                               ├─ /api/send-alert       ─── Firebase FCM
                               └─ /api/health           ─── Health check
                                    │
                                    ▼
                         Supabase (PostgreSQL + Realtime + Auth + Storage)
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, Vanilla JS, Tailwind CSS, Leaflet.js, Chart.js |
| **Backend** | Python 3.10+, Flask, Flask-CORS |
| **AI/NLP** | Google Gemini 1.5 Flash |
| **Database** | Supabase (PostgreSQL + Realtime + Auth + Storage) |
| **Push Notifications** | Firebase Cloud Messaging (FCM) via `firebase-admin` SDK |
| **Social Media** | Gopher API (Twitter live search) |
| **Security** | DOMPurify (XSS), server-side API keys, Supabase RLS |

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.10+
- pip
- A [Supabase](https://supabase.com) project (free tier works)
- A [Google AI Studio](https://makersuite.google.com/app/apikey) API key (for Gemini)
- (Optional) A [Firebase](https://console.firebase.google.com) project for FCM

### 1. Clone the repository
```bash
git clone https://github.com/your-username/Samudra-Suraksha.git
cd Samudra-Suraksha
```

### 2. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure environment variables
```bash
cp .env.example backend/.env
# Edit backend/.env with your real API keys
```

### 4. Set up the database
Copy the contents of `database_setup.sql` and run it in the **Supabase SQL Editor**:
- Dashboard → SQL Editor → New Query → Paste → Run

### 5. (Optional) Firebase FCM setup
1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate a new private key JSON file
3. Save it as `backend/firebase_service_account.json`
4. Update `FIREBASE_SERVICE_ACCOUNT_PATH` in `backend/.env`

---

## 🔐 Environment Variables

Create `backend/.env` (never commit this file):

| Variable | Description | Required |
|---|---|---|
| `GOPHER_API_URL` | Gopher Twitter API endpoint | ✅ |
| `GOPHER_AUTH_TOKEN` | Gopher authentication token | ✅ |
| `GEMINI_API_KEY` | Google Gemini API key | ✅ |
| `GEMINI_MODEL` | Gemini model name (e.g., `gemini-1.5-flash`) | ✅ |
| `SUPABASE_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) | ⚠️ For server ops |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase service account JSON | 🔔 For FCM |
| `FCM_DEFAULT_TOPIC` | FCM topic for broadcast (default: `gov_alerts`) | 🔔 |
| `FLASK_SECRET_KEY` | Flask session secret (change in production!) | ✅ |
| `FLASK_ENV` | `development` or `production` | ✅ |

---

## 🗄 Database Setup (Supabase)

The full schema is in [`database_setup.sql`](database_setup.sql). Key tables:

| Table | Purpose |
|---|---|
| `user_reports` | Citizen-submitted hazard reports |
| `gov_alerts` | Government-issued alerts |
| `users_metadata` | Officer profiles (department, state, role) |
| `social_intelligence` | Persisted tweet analysis results |
| `audit_log` | Officer action audit trail |

RLS policies ensure:
- Only `gov_portal` role users can read all reports
- Citizens can only insert their own reports
- Only authenticated users can insert alerts

---

## ▶️ Running the Application

```bash
# Start the Flask server
python app.py
```

The app will be available at: **http://localhost:5000**

- Login page: `http://localhost:5000/`
- Dashboard: `http://localhost:5000/dashboard`
- Health check: `http://localhost:5000/api/health`

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/twitter/search` | Search Twitter via Gopher API |
| `GET` | `/api/twitter/result/<jobUUID>` | Poll search results |
| `POST` | `/api/analyze-tweets` | Analyze tweet batch with Gemini AI |
| `POST` | `/api/send-alert` | Send FCM push notification |
| `GET` | `/api/health` | Health check |

### Example: Analyze Tweets
```bash
curl -X POST http://localhost:5000/api/analyze-tweets \
  -H "Content-Type: application/json" \
  -d '{"tweets": [{"content": "Massive flooding in Chennai Marina Beach! Help needed!", "metadata": {"username": "citizen123"}}]}'
```

---

## 📁 Project Structure

```
Samudra-Suraksha/
├── app.py                    # Flask entry point (Blueprint-based)
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variable template
├── .gitignore                # Git ignore rules
├── database_setup.sql        # Supabase SQL schema
│
├── backend/                  # Server-side code
│   ├── .env                  # ⚠️ Secrets (never committed)
│   ├── config.py             # Central config from env vars
│   ├── __init__.py
│   ├── routes/
│   │   ├── twitter.py        # Twitter search proxy
│   │   ├── analysis.py       # Gemini NLP + spike detection
│   │   ├── alerts.py         # FCM push notifications
│   │   └── __init__.py
│   └── services/
│       ├── gemini_service.py # Gemini AI analysis service
│       ├── fcm_service.py    # Firebase Cloud Messaging
│       └── __init__.py
│
├── auth.html                 # Login/signup page
├── samudradashboard.html     # Main dashboard
├── dashboard33.js            # Dashboard logic (reports, maps, alerts)
├── social.js                 # Social media monitoring
├── coastalinfo.js            # Coastal information tab
├── auth.js                   # Authentication logic
└── logo.png                  # Application logo
```

---

## 🔒 Security Notes

1. **API keys are server-side only** — Gemini and Gopher tokens live in `backend/.env`, never in browser JS
2. **DOMPurify** sanitizes all user-generated HTML before DOM injection
3. **Supabase Anon Key** is safe to expose (designed for client-side), but **RLS policies** must be enabled
4. **Firebase Service Account** key must never be committed — it's in `.gitignore`
5. **Path traversal protection** on Flask static file serving
6. **Audit logging** tracks all officer actions (verify, reject, delete)

---

## 👥 Team

**CSDS-A Group 12**

---

## 📄 License

This project is for academic purposes. Contact the team for licensing inquiries.
