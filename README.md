<div align="center">

# 🔐 CipherAI SecureCloud

### AI-Powered Encrypted Cloud File Storage Platform

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![AWS S3](https://img.shields.io/badge/AWS-S3-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

> A comprehensive, security-first cloud storage solution that encrypts every file with **AES-256-CBC + RSA-OAEP** before storage, features **AI-powered natural language search** via LLM, supports an **AI PDF Agent** for conversational Q&A on PDFs, and provides **secure file sharing** with per-recipient cryptographic key re-wrapping.

</div>

---

## 📋 Table of Contents

1.  [Introduction](#introduction)
2.  [Problem Statement](#problem-statement)
3.  [Proposed Solution](#proposed-solution)
4.  [Key Features](#key-features)
5.  [System Architecture](#system-architecture)
6.  [Technology Stack](#technology-stack)
7.  [User Roles](#user-roles)
8.  [Workflow Explanation](#workflow-explanation)
9.  [Project Structure](#project-structure)
10. [Database Design (MongoDB / Firestore)](#database-design-mongodb--firestore)
11. [Local Development Setup](#local-development-setup)
12. [How to Run the Project](#how-to-run-the-project)
13. [Demo Instructions](#demo-instructions)
14. [Use Cases](#use-cases)
15. [Advantages of the System](#advantages-of-the-system)
16. [Limitations](#limitations)
17. [Future Scope](#future-scope)
18. [Conclusion](#conclusion)

---

## 🌟 Introduction

**CipherAI SecureCloud** is a full-stack encrypted cloud file storage platform designed with a **security-first** philosophy. Every file uploaded to the system is encrypted client-side in memory using **AES-256-CBC** symmetric encryption, with the AES key itself protected via **RSA-OAEP** asymmetric wrapping, before being stored on **AWS S3**. File metadata, encrypted keys, and user profiles are managed through **Google Cloud Firestore**, while authentication is handled by **Firebase Auth** (supporting email/password and Google OAuth).

What sets CipherAI SecureCloud apart is its dual AI layer: **AI-powered Smart Search** for metadata discovery and a **PDF AI Agent** for content-level Q&A on PDF files. During upload, users choose whether to keep **Advance Security ON** (maximum lock-down, chatbot disabled) or switch it OFF (AI Agent enabled for that PDF). The system also supports **voice-based search** through the Web Speech API, **secure file sharing** with granular permissions and cryptographic key re-wrapping, **automatic file expiry** with email notifications, and a **rich analytics dashboard** with visual charts.

---

## 🎯 Problem Statement

In today's digital landscape, cloud storage has become indispensable. However, most existing solutions suffer from critical shortcomings:

| Problem | Impact |
|---------|--------|
| **Data stored in plaintext** | Cloud providers or attackers with access to storage infrastructure can read user files |
| **Weak access control** | Simple link-based sharing lacks granular permission enforcement |
| **No encryption at rest by default** | Files remain vulnerable even when "at rest" on cloud servers |
| **Key management is an afterthought** | Encryption keys stored alongside data or managed insecurely |
| **Search requires exact keywords** | Users cannot find files using natural language or contextual queries |
| **No automatic data lifecycle** | Files persist indefinitely, increasing attack surface and storage costs |
| **Lack of auditability** | No visibility into who accessed what, when, or how files are distributed |

Organizations and individuals dealing with **sensitive documents** — medical records, financial statements, legal contracts, government IDs — need a platform that treats encryption as a **fundamental requirement**, not an optional add-on.

---

## 💡 Proposed Solution

CipherAI SecureCloud addresses every identified problem with a layered, defense-in-depth architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                      CipherAI SecureCloud                       │
├─────────────────────────────────────────────────────────────────┤
│  🔐 AES-256-CBC Encryption    → Every file encrypted before S3 │
│  🗝️  RSA-OAEP Key Wrapping    → AES keys protected by RSA-2048 │
│  🤖 AI Smart Search (LLM)     → Natural language file queries  │
│  📄 AI PDF Agent (RAG)        → Ask questions about PDF content │
│  🎙️  Voice Search              → Web Speech API integration     │
│  🔗 Secure Sharing             → Per-recipient key re-wrapping  │
│  ⏰ Auto Expiry + Cleanup      → Background thread + email warn │
│  📊 Analytics Dashboard        → Upload trends, storage, types  │
│  📧 Email Notifications        → Share alerts, expiry warnings  │
│  🔥 Firebase Auth              → Email/password + Google OAuth  │
│  ☁️  AWS S3 Storage             → Encrypted blob persistence    │
│  📁 Tag-Based Organization     → Folder-like category system    │
└─────────────────────────────────────────────────────────────────┘
```

**Core Principle:** *Zero plaintext files ever reach cloud storage.* The encryption happens in-memory on the backend before any data is written to S3. Decryption happens on-demand, also in-memory, and the plaintext is streamed directly to the user.

---

## ✨ Key Features

### 🔒 Encryption & Security
- **AES-256-CBC** symmetric encryption for all uploaded files
- **RSA-2048 OAEP** (SHA-256, MGF1) asymmetric wrapping of AES keys
- In-memory encryption/decryption — **no plaintext ever touches disk**
- Per-file random AES key generation (32 bytes) + random IV (16 bytes)
- Auto-generation of RSA keypair on first run
- User's public key synced to Firestore on every authenticated request

### 🤖 AI-Powered Smart Search
- Natural language queries translated to Firestore queries via **LLM** (HuggingFace API)
- Schema-aware prompt engineering for accurate query generation
- 3-tier query execution fallback (full query → no order_by → memory filtering)
- User ID resolution for human-readable results
- **Voice search** via Web Speech API with real-time audio visualization

### 📤 File Management
- Single and **batch upload** (up to 15 files simultaneously)
- Per-file metadata: tag assignment, expiry date, advance security toggle
- **Upload mode selection per file**:
   - **Secure Mode (Advance Security = ON):** strongest restriction, PDF AI Agent disabled
   - **AI Agent Mode (Advance Security = OFF):** allows conversational PDF assistant
- "Apply to All" mode for batch configuration
- File preview (PDF via iframe, images inline)
- Download with automatic decryption
- Bulk operations: delete, move between tags, share
- Tag-based folder organization with 10 default categories

### 📄 AI PDF Agent (Chat With PDF)
- Available for **PDF files only**
- Triggered from Preview Overlay when **advance_security = false**
- Backend route `POST /chatbot/process-pdf` decrypts PDF in memory, extracts text, chunks content, builds FAISS index
- Semantic retrieval with SentenceTransformers embeddings + FAISS cosine similarity
- Answer generation via LLM using top-K relevant chunks
- OCR fallback (pdf2image + Tesseract) for scanned PDFs
- Chat history persisted per file in Firestore subcollection
- If a file is uploaded in Secure Mode, chatbot requests are rejected by backend policy

### 🔗 Secure File Sharing
- Share files with any registered user by email
- **Cryptographic key re-wrapping**: AES key unwrapped with owner's private key, re-wrapped with recipient's public key
- **Granular permissions**: "View Only" or "View & Download"
- **Share expiry**: Optional time-limited access
- **Email notifications**: Recipients notified via styled HTML email
- **Extension requests**: Shared users can request expiry extension from owner

### ⏰ Automatic File Expiry
- Optional per-file expiry dates
- Background daemon thread checking every **15 minutes**
- Automatic cleanup: deletes expired files from S3 + Firestore + associated shares
- **24-hour warning emails** sent to owners and shared users
- Extend or remove expiry via UI

### 📊 Analytics Dashboard
- **Summary cards**: Total files, storage used, shared count, encryption rate
- **Upload Activity**: Area chart of uploads over last 30 days with trend
- **File Type Distribution**: Pie chart (Documents, Images, Videos, Audio, Archives, etc.)
- **Storage by Folder**: Horizontal bar chart by tag
- **Security Overview**: Progress meters for advanced security, standard encryption, expiry, sharing
- **Expiring Soon**: Files expiring within 7 days
- **Recent Activity**: Last accessed files

### ⚙️ Settings & Account Management
- **Profile editing**: Display name, avatar URL
- **Storage monitoring**: Visual ring chart and usage bar
- **Account deletion**: Double-confirmation (password + "DELETE" text)
- **Appearance**: Theme selector (Dark/Light/System)
- **Notifications**: Toggle switches for various alert types

### 📧 Email Service
- Professional HTML email templates with gradient headers
- Share notifications with file details and CTA buttons
- Expiry warning emails (24h before) for owners and shared users
- Extension request emails
- **Gmail SMTP** with TLS

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    React 18 + Vite (SPA)                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────────────┐ │  │
│  │  │ Firebase  │ │  Pages   │ │Components │ │    Hooks            │ │  │
│  │  │   Auth    │ │Dashboard │ │ FileList  │ │ useAuth, useFiles   │ │  │
│  │  │  Client   │ │ MyFiles  │ │ Sidebar   │ │ useUploader         │ │  │
│  │  │          │ │Analytics │ │ShareOverlay│ │                     │ │  │
│  │  │          │ │SmartSearch│ │UploadOverlay│                    │ │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └─────────────────────┘ │  │
│  └──────────────────────────┬─────────────────────────────────────────┘  │
│                             │ HTTP + Bearer Token                        │
└─────────────────────────────┼────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────────┐
│                         API LAYER (FastAPI)                               │
│                              │                                            │
│  ┌───────────────────────────▼──────────────────────────────────────┐    │
│  │                    CORS Middleware                                │    │
│  │              Firebase Token Verification                         │    │
│  └──────────────────────────┬───────────────────────────────────────┘    │
│                              │                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐   │
│ │ auth.py  │ │ files.py │ │analytics │ │ smart_search │ │ chatbot  │   │
│ │ /auth/*  │ │ /files/* │ │/analytics│ │ /smart-search│ │/chatbot/*│   │
│ └──────────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ └────┬─────┘   │
│                    │            │               │               │         │
│  ┌─────────────────▼────────────▼───────────────▼───────────────▼───┐   │
│  │            Core Services                                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐   │   │
│  │  │ crypto.py│ │  s3.py   │ │security.py│ │ email_service.py │   │   │
│  │  │ RSA Keys │ │S3 Upload │ │Token Auth │ │ SMTP Emails      │   │   │
│  │  └──────────┘ │S3 Download│ │User Sync  │ └──────────────────┘   │   │
│  │               │S3 Delete │ └───────────┘                         │   │
│  │               └──────────┘                                        │   │
│  │  ┌───────────────┐  ┌───────────────────┐                        │   │
│  │  │encrypt_file.py│  │ expiry_service.py │                        │   │
│  │  │AES-256-CBC    │  │ Background Thread │                        │   │
│  │  │RSA-OAEP Wrap  │  │ 15-min intervals  │                        │   │
│  │  └───────────────┘  └───────────────────┘                        │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │ chatbot/ module                                              │  │   │
│  │  │ pdf_extractor.py → text+OCR                                 │  │   │
│  │  │ text_processing.py → chunking                               │  │   │
│  │  │ embeddings.py → embedding + FAISS index                     │  │   │
│  │  │ llm.py → answer generation                                  │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────────────┐
              │               │                       │
┌─────────────▼──┐  ┌────────▼────────┐  ┌──────────▼──────────┐
│   AWS S3       │  │ Google Firestore│  │  External APIs      │
│  ┌───────────┐ │  │  ┌────────────┐ │  │  ┌───────────────┐  │
│  │.enc blobs │ │  │  │  users     │ │  │  │ Firebase Auth │  │
│  │(encrypted)│ │  │  │  user_files│ │  │  │ HuggingFace   │  │
│  └───────────┘ │  │  │  shared    │ │  │  │ Gmail SMTP    │  │
│                │  │  │  tags      │ │  │  └───────────────┘  │
└────────────────┘  │  └────────────┘ │  └─────────────────────┘
                    └─────────────────┘
```

---

## 🛠️ Technology Stack

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Python** | 3.10+ | Primary backend language |
| **FastAPI** | Latest | Async REST API framework |
| **Uvicorn** | Latest | ASGI server |
| **cryptography** | Latest | AES-256-CBC encryption, RSA-2048 OAEP key wrapping |
| **firebase-admin** | Latest | Firebase Auth token verification, Firestore access |
| **boto3** | Latest | AWS S3 SDK for encrypted file storage |
| **python-dotenv** | Latest | Environment variable management |
| **requests** | Latest | HuggingFace LLM API calls |
| **sentence-transformers** | Latest | PDF chunk embedding generation |
| **faiss-cpu** | Latest | Vector similarity index for PDF retrieval |
| **pypdf** | Latest | PDF text-layer extraction |
| **pdf2image** | Latest | Convert PDF pages to images for OCR fallback |
| **pytesseract** | Latest | OCR on scanned PDF pages |
| **Pillow** | Latest | Image processing for OCR pipeline |
| **smtplib** | Built-in | Gmail SMTP email delivery |

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 18.3 | UI component library |
| **Vite** | 5.0 | Build tool and dev server |
| **React Router DOM** | 6.22 | Client-side routing |
| **Firebase SDK** | 11.0 | Client-side authentication |
| **Recharts** | 3.7 | Charts & data visualization |
| **Lucide React** | 0.563 | Icon library |

### Cloud & Infrastructure

| Service | Purpose |
|---------|---------|
| **Firebase Authentication** | Email/password + Google OAuth sign-in |
| **Google Cloud Firestore** | NoSQL document database for metadata |
| **AWS S3** | Encrypted file blob storage |
| **Gmail SMTP** | Transactional email notifications |
| **HuggingFace Inference API** | LLM for natural language → Firestore query |
| **Web Speech API** | Browser-native voice recognition |

---

## 👤 User Roles

CipherAI SecureCloud operates with a **single user role model** where every authenticated user has full capabilities:

| Capability | Description |
|-----------|-------------|
| **Upload & Encrypt** | Upload files with automatic AES-256-CBC encryption |
| **Organize** | Assign files to tag-based folders (10 default categories) |
| **Preview & Download** | Decrypt and preview/download owned files |
| **Share** | Share encrypted files with other registered users |
| **Set Permissions** | Choose "View Only" or "View & Download" for shared files |
| **Set Expiry** | Define auto-deletion dates for files and shares |
| **Smart Search** | Use AI-powered natural language and voice search |
| **PDF AI Agent** | Chat with uploaded PDFs (when Advance Security is OFF) |
| **View Analytics** | Access personal analytics dashboard |
| **Manage Account** | Edit profile, change password, manage storage, delete account |

### Shared User Permissions

| Permission Level | Can Preview | Can Download | Can Extend | AES Key Access |
|-----------------|------------|-------------|-----------|----------------|
| **View Only** | ✅ | ❌ | Can request | Re-wrapped copy |
| **View & Download** | ✅ | ✅ | Can request | Re-wrapped copy |

---

## 🔄 Workflow Explanation

### 1. Authentication Flow

```
User → Firebase Auth (Email/Password or Google) → ID Token
  → Backend verifies token via Firebase Admin SDK
  → User profile synced to Firestore (incl. RSA public key)
  → JWT-like session maintained via Firebase ID tokens
```

### 2. File Upload & Encryption Flow

```
1. User selects file(s) + metadata (tag, expiry, advance_security)
2. User chooses file mode using `advance_security`:
   - advance_security = true  → Secure Mode (chatbot disabled)
   - advance_security = false → AI Agent Mode (chatbot enabled for PDFs)
3. Frontend → POST /upload/multiple (FormData: files + JSON metadata)
4. Backend for each file:
   a. Generate random 32-byte AES key + 16-byte IV
   b. PKCS7-pad plaintext → AES-256-CBC encrypt
   c. Encrypted blob = IV (16B) || ciphertext
   d. RSA-OAEP wrap AES key with server's public key → base64 encode
   e. Upload encrypted blob to S3: users/{uid}/files/{filename}.enc
   f. Store metadata + wrapped AES key in Firestore: user_files/{uid}:{filename}
5. Response: success with file count
```

### 3. File Decryption & Preview Flow

```
1. User clicks a file → Frontend POST /decrypt { file_name }
2. Backend:
   a. Fetch file metadata from Firestore → get wrapped AES key
   b. Download .enc blob from S3
   c. RSA-OAEP unwrap AES key with server's private key
   d. Split blob: first 16 bytes = IV, rest = ciphertext
   e. AES-256-CBC decrypt → PKCS7 unpad
   f. Return raw plaintext bytes with proper Content-Type
3. Frontend creates blob URL → displays in iframe (PDF) or img tag
```

### 4. PDF AI Agent Flow (Conditional)

```
1. User opens a PDF in Preview Overlay
2. Frontend checks file metadata:
   - If advance_security = true  → chatbot panel hidden/disabled
   - If advance_security = false → show PDF Assistant panel
3. Frontend POST /chatbot/process-pdf { file_name }
4. Backend:
   a. Verify file ownership and enforce advance_security == false
   b. Decrypt PDF in memory from S3 + wrapped AES key
   c. Extract text (pypdf), fallback to OCR for scanned pages
   d. Create chunks with page metadata
   e. Generate embeddings and build/load FAISS cache index
5. User asks question via POST /chatbot/ask
6. Backend retrieves top-k chunks and asks LLM to generate grounded answer
7. Chat history is stored under user_files/{file_id}/chat_history
```

### 5. Secure File Sharing Flow

```
1. Owner selects file → clicks Share → searches for recipient by email
2. Owner sets permissions (View/Download) + optional expiry
3. Frontend POST /files/share { file_name, shared_user_id, permissions, expiry }
4. Backend:
   a. Fetch owner's wrapped AES key from Firestore
   b. Unwrap AES key with server's RSA private key
   c. Fetch recipient's RSA public key from Firestore
   d. Re-wrap AES key with recipient's public key → store in shared_files
   e. Send email notification to recipient
5. Recipient sees file in "Shared With Me" → can preview (and download if permitted)
```

### 6. Auto-Expiry Flow

```
Background thread (every 15 minutes):
1. Scan user_files where expiry_time ≤ now → delete from S3 + Firestore + shared
2. Scan user_files where expiry_time ≤ now + 24h → send warning email to owner
3. Scan shared_files where sharedExpiryTime ≤ now → delete share records
4. Scan shared_files where sharedExpiryTime ≤ now + 24h → send warning to shared user
```

### 7. AI Smart Search Flow

```
1. User types (or speaks) a natural language query
2. Frontend POST /smart-search { query }
3. Backend:
   a. Build LLM prompt with full Firestore schema + user query
   b. Call HuggingFace Inference API (LLM)
   c. Parse LLM JSON response → Firestore query object
   d. Execute query with 3-tier fallback strategy
   e. Resolve user IDs to names/emails
   f. Return results with LLM-generated description
4. Frontend displays clickable result cards
```

---

## 📂 Project Structure

```
CipherAI-SecureCloud/
│
├── 📄 README.md                          # This file
├── 📄 requirements.txt                   # Python backend dependencies
├── 📁 keys/                              # RSA keypair (auto-generated)
│   ├── private.pem                       # RSA-2048 private key (PKCS8 PEM)
│   └── public.pem                        # RSA-2048 public key (SPKI PEM)
│
├── 📁 backend/                           # Python FastAPI backend
│   ├── app.py                            # FastAPI entry point, CORS, router registration
│   ├── encrypt_file.py                   # AES-256-CBC encryption + RSA-OAEP key wrapping
│   ├── decrypt_file.py                   # AES-256-CBC decryption + RSA-OAEP key unwrapping
│   ├── generate_keys.py                  # Standalone RSA keypair generator script
│   ├── firebase_admin_init.py            # Firebase Admin SDK initialization
│   ├── firebase_key.json                 # Firebase service account key (gitignored)
│   │
│   ├── 📁 core/                          # Core infrastructure modules
│   │   ├── constants.py                  # Collection names, CORS origins, upload limits
│   │   ├── crypto.py                     # RSA key management & auto-generation
│   │   ├── paths.py                      # Filesystem paths (keys/, base dirs)
│   │   ├── s3.py                         # AWS S3 operations (upload/download/delete)
│   │   └── security.py                   # Firebase token auth, UserContext, profile sync
│   │
│   ├── 📁 models/                        # Pydantic data models
│   │   ├── files.py                      # FileModel (metadata, AES key, expiry)
│   │   ├── shared.py                     # SharedFileModel (permissions, re-wrapped key)
│   │   ├── tag.py                        # TagModel + default tag seeding
│   │   └── user.py                       # UserModel (profile, public key)
│   │
│   ├── 📁 routes/                        # API route handlers
│   │   ├── auth.py                       # /auth/verify, /auth/me
│   │   ├── files.py                      # /upload, /decrypt, /files/*, /download, /share
│   │   ├── analytics.py                  # /analytics (charts, stats, trends)
│   │   ├── smart_search.py               # /smart-search (LLM-powered NL queries)
│   │   └── chatbot.py                    # /chatbot/process-pdf, /chatbot/ask, /chatbot/status
│   │
│   ├── 📁 chatbot/                       # PDF AI Agent pipeline modules
│   │   ├── config.py                     # Model + retrieval settings
│   │   ├── pdf_extractor.py              # PDF text extraction + OCR fallback
│   │   ├── text_processing.py            # Chunk generation with page metadata
│   │   ├── embeddings.py                 # Embedding + FAISS index save/load/search
│   │   └── llm.py                        # Answer synthesis from retrieved chunks
│   │
│   ├── 📁 chatbot_db/                    # Cached FAISS indexes + chunk maps
│   │   ├── *.faiss                       # Vector index files by content hash
│   │   └── *_chunks.json                 # Chunk metadata per index
│   │
│   └── 📁 services/                      # Background & external services
│       ├── email_service.py              # Gmail SMTP notifications (HTML templates)
│       ├── expiry_service.py             # Background expiry checker (15-min daemon)
│       └── s3_service.py                 # Legacy S3 helper (standalone)
│
├── 📁 frontend/                          # React + Vite frontend
│   ├── index.html                        # HTML entry point
│   ├── package.json                      # Node.js dependencies
│   ├── vite.config.js                    # Vite configuration (port 5173, COOP header)
│   │
│   └── 📁 src/
│       ├── main.jsx                      # React DOM render entry
│       ├── App.jsx                       # BrowserRouter wrapper
│       ├── router.jsx                    # Route definitions + ProtectedRoute guard
│       ├── firebase.js                   # Firebase client SDK initialization
│       ├── styles.css                    # Global styles (dark theme)
│       │
│       ├── 📁 context/
│       │   └── UserContext.jsx           # Auth context (currentUser, idToken)
│       │
│       ├── 📁 hooks/
│       │   ├── useAuth.js               # Firebase auth state management
│       │   ├── useFiles.js              # File CRUD, preview, download, sharing
│       │   └── useUploader.js           # Multi-file upload workflow
│       │
│       ├── 📁 layouts/
│       │   └── AppShellLayout.jsx       # Sidebar + content + overlay composition
│       │
│       ├── 📁 pages/
│       │   ├── Dashboard.jsx            # Home: search, recent files, stats
│       │   ├── MyFiles.jsx              # Tag folder grid + file management
│       │   ├── TagFiles.jsx             # Files within a specific tag
│       │   ├── SharedWithMe.jsx         # Files shared by others
│       │   ├── Analytics.jsx            # Charts & analytics dashboard
│       │   ├── SmartSearch.jsx          # AI search + voice input
│       │   ├── Settings.jsx             # Profile, security, storage, danger zone
│       │   ├── Preview.jsx              # Standalone file preview page
│       │   ├── Login.jsx                # Login page
│       │   └── Signup.jsx               # Signup page
│       │
│       ├── 📁 components/
│       │   ├── FileList.jsx             # Reusable file table with selection
│       │   ├── FolderCard.jsx           # Tag folder display card
│       │   ├── MainContent.jsx          # Legacy main content container
│       │   ├── PreviewOverlay.jsx       # File preview modal (PDF/image)
│       │   ├── PdfChatbot.jsx           # Embedded PDF Assistant panel
│       │   ├── ShareOverlay.jsx         # Share dialog (user search, permissions)
│       │   ├── Sidebar.jsx              # Navigation sidebar with storage bar
│       │   ├── StatusPill.jsx           # Status badge component
│       │   ├── 📁 auth/
│       │   │   ├── LoginForm.jsx        # Email/password + Google login form
│       │   │   └── SignupForm.jsx        # Registration form
│       │   └── 📁 uploads/
│       │       └── UploadOverlay.jsx    # Drag-and-drop multi-file upload modal
│       │
│       └── 📁 utils/
│           ├── api.js                   # API base URL + authorized fetch wrapper
│           ├── constants.js             # Status labels, max upload limit
│           └── formatters.js            # Byte formatting, date formatting, error msgs
```
---

## 🗃️ Database Design (MongoDB / Firestore)

CipherAI SecureCloud uses **Google Cloud Firestore** (a NoSQL document database) as its primary data store. The design follows a **document-per-entity** model.

### Collection: `users`

| Field | Type | Description |
|-------|------|-------------|
| `uid` | `string` | Firebase Auth UID (document ID) |
| `email` | `string` | User's email address |
| `name` | `string` | Display name |
| `picture` | `string` | Avatar URL |
| `public_key` | `string` | RSA-2048 public key (PEM format) |
| `lastLogin` | `timestamp` | Last authentication time |
| `createdAt` | `timestamp` | Account creation time |

### Collection: `user_files`

| Field | Type | Description |
|-------|------|-------------|
| _Document ID_ | `string` | Format: `{uid}:{sanitized_filename}` |
| `file_name` | `string` | Original filename |
| `size` | `number` | File size in bytes |
| `uid` | `string` | Owner's Firebase UID |
| `aes_key` | `string` | Base64-encoded RSA-OAEP wrapped AES-256 key |
| `tag_id` | `string` | Tag/folder category ID |
| `expiry_time` | `string` (ISO) | Auto-deletion timestamp (nullable) |
| `advance_security` | `boolean` | Enhanced security flag |
| `uploaded_at` | `string` (ISO) | Upload timestamp |
| `last_opened_at` | `string` (ISO) | Last access/preview timestamp |

### Collection: `shared_files`

| Field | Type | Description |
|-------|------|-------------|
| _Document ID_ | `string` | Auto-generated |
| `owner_id` | `string` | File owner's UID |
| `shared_user_id` | `string` | Recipient's UID |
| `file_id` | `string` | Format: `{owner_uid}:{filename}` |
| `aes_key_shared` | `string` | Re-wrapped AES key (encrypted with recipient's public key) |
| `permissions` | `string` | `"view"` or `"download"` |
| `sharedExpiryTime` | `string` (ISO) | Share access expiry (nullable) |
| `createdAt` | `timestamp` | Share creation time |

### Collection: `tags`

| Field | Type | Description |
|-------|------|-------------|
| _Document ID_ | `string` | Tag ID (lowercase name) |
| `tag_id` | `string` | Same as document ID |
| `tag_name` | `string` | Display name |

**Default Tags:** Academics, Government Documents, Finance, Medical Records, Business Documents, Bills, Tax Records, Bank Documents, Personal Documents, Archive

## 🚀 Local Development Setup

### Prerequisites

| Requirement | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.10+ | Backend runtime |
| **Node.js** | 18+ | Frontend build tooling |
| **npm** | 9+ | Package management |
| **Git** | Latest | Version control |
| **AWS Account** | — | S3 bucket for file storage |
| **Firebase Project** | — | Auth + Firestore |
| **Gmail Account** | — | SMTP email (App Password required) |
| **HuggingFace Account** | — | API token for Smart Search LLM |
| **Tesseract OCR** | Latest | OCR fallback for scanned PDFs in PDF AI Agent |
| **Poppler** | Latest | Required by pdf2image for PDF page conversion |

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/CipherAI-SecureCloud.git
cd CipherAI-SecureCloud
```

### Step 2: Backend Setup

```bash
# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Step 3: Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or select existing)
3. Enable **Authentication** → Sign-in methods: **Email/Password** + **Google**
4. Enable **Cloud Firestore** → Create database in production mode
5. Go to **Project Settings** → **Service Accounts** → **Generate New Private Key**
6. Save the JSON file as `backend/firebase_key.json`

### Step 4: AWS S3 Configuration

1. Go to [AWS Console](https://aws.amazon.com/console/) → S3
2. Create a new bucket (e.g., `cipherai-securecloud-files`)
3. Create an IAM user with `AmazonS3FullAccess` policy
4. Generate **Access Key ID** and **Secret Access Key**

### Step 5: Environment Variables

Create `backend/.env`:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=your-bucket-name

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:5173

# HuggingFace API (for Smart Search + PDF AI Agent answers)
HF_TOKEN=hf_your_huggingface_token

# Email Service (Gmail SMTP)
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:5173
```

Create `frontend/.env`:

```env
# Backend API
VITE_API_URL=http://localhost:8000

# Firebase Client Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Step 6: Frontend Setup

```bash
cd frontend
npm install
```

---

## ▶️ How to Run the Project

### Start the Backend

```bash
cd backend
python app.py
```

The FastAPI server starts at **http://localhost:8000**.

- Interactive API docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Start the Frontend

```bash
cd frontend
npm run dev
```

The Vite dev server starts at **http://localhost:5173**.

### RSA Key Generation

RSA keys are **automatically generated** on first backend startup in the `keys/` directory. To manually regenerate:

```bash
cd backend
python generate_keys.py
```

### Seed Default Tags

```bash
cd backend
python -m models.tag
```

---

## 🎮 Demo Instructions

### 1. Create an Account

1. Navigate to **http://localhost:5173**
2. Click **"Create one"** to go to the Signup page
3. Enter your **name**, **email**, and **password**
4. Alternatively, click **"Sign in with Google"** for OAuth

### 2. Upload Files

1. Click the **"Upload"** button in the sidebar or dashboard
2. **Drag & drop** files or click **"Browse"** to select
3. For each file, optionally set:
   - **Tag/Folder**: Choose a category (e.g., Finance, Medical Records)
   - **Expiry Date**: Set auto-deletion date
   - **Advance Security**: Select upload mode
     - **ON = Secure Mode** (chatbot disabled for that file)
     - **OFF = AI Agent Mode** (PDF Assistant available)
4. Use **"Apply to All"** to set the same metadata for all files
5. Click **"Upload & Encrypt"** — each file is AES-256 encrypted and stored

### 3. Preview & Download Files

1. Navigate to **My Files** → click a folder or view untagged files
2. Click any file to open the **Preview Overlay**
3. PDFs render inline; images display directly
4. For PDF files uploaded with **Advance Security OFF**, a **PDF Assistant** panel appears
5. For PDF files uploaded with **Advance Security ON**, PDF Assistant is not available
6. Click **"Download"** to get the decrypted file

### 4. Chat With PDF (AI Agent)

1. Open a PDF that was uploaded with **Advance Security OFF**
2. Wait for the assistant to process and index the PDF content
3. Ask questions like:
   - *"Summarize this document"*
   - *"What does page 5 say about payment terms?"*
   - *"List key deadlines mentioned in this PDF"*
4. Review grounded answers generated from retrieved PDF chunks
5. Continue the conversation with follow-up questions

### 5. Share a File

1. Preview a file → click the **"Share"** button
2. Search for a user by **email address**
3. Select **permissions**: View Only or View & Download
4. Optionally set a **share expiry date**
5. Click **"Share"** — the recipient receives an email notification

### 6. View Shared Files

1. Navigate to **"Shared with me"** in the sidebar
2. View files shared by others with owner info and permission badges
3. Click to preview; download if permission allows
4. Request an **expiry extension** if access is about to expire

### 7. AI Smart Search

1. Navigate to **"Smart Search"** in the sidebar
2. Try natural language queries:
   - *"Show me all PDF files"*
   - *"Files uploaded in the last week"*
   - *"Medical records shared with me"*
   - *"Large files over 5MB"*
3. Click the **microphone icon** for voice search
4. Click any result to preview the file

### 8. Analytics Dashboard

1. Navigate to **"Analytics"** in the sidebar
2. Explore:
   - Total file count and storage usage
   - Upload activity over 30 days
   - File type distribution pie chart
   - Storage breakdown by folder
   - Security metrics
   - Expiring files dashboard

### 9. Account Settings

1. Click the **gear icon** or navigate to **Settings**
2. Explore tabs:
   - **Profile**: Change name and avatar
   - **Security**: Update password
   - **Storage**: Monitor usage (100 MB quota)
   - **Danger Zone**: Delete account (requires confirmation)

---

## 📋 Use Cases

### 1. Healthcare & Medical Records
A hospital stores patient records — MRI scans, lab results, prescriptions. Each document is AES-256 encrypted on upload, tagged under **"Medical Records"**, and shared with specific doctors with **View Only** access. Records auto-expire after treatment completion.

### 2. Legal & Compliance
A law firm manages confidential case files. Documents are encrypted and organized by case under custom tags. Sharing with external counsel uses **permission-controlled** access with **expiry dates**.

### 3. Financial Services
An accountant manages tax returns and financial statements. Files are tagged under **"Finance"**, **"Tax Records"**, and **"Bank Documents"**. Smart Search helps quickly find *"all tax returns from 2024"* using natural language.

### 4. Education
Students and professors securely share academic materials. Research papers, thesis drafts, and study materials are organized under **"Academics"** with controlled sharing.

### 5. Personal Document Vault
Individuals store sensitive personal documents — IDs, passports, insurance policies — in an encrypted vault. **Auto-expiry** helps clean up temporary documents, and **voice search** enables quick, hands-free file retrieval.

### 6. Enterprise File Sharing
Teams share confidential business documents with **granular permissions**. The analytics dashboard helps monitor file distribution, and the expiry system ensures temporary access is automatically revoked.

### 7. Contract Review With PDF Agent
A legal analyst uploads vendor contracts with **Advance Security OFF** and asks the PDF AI Agent to extract payment terms, renewal clauses, and penalties. For highly confidential contracts, they upload with **Advance Security ON** to disable conversational AI access.

---

## ✅ Advantages of the System

| Advantage | Description |
|-----------|-------------|
| **Military-Grade Encryption** | AES-256-CBC + RSA-2048 OAEP — the same standards used by governments |
| **Zero-Knowledge Storage** | Plaintext never reaches S3; even a storage breach yields useless ciphertext |
| **AI-Powered UX** | Natural language and voice search lower the barrier to finding files |
| **Mode-Based AI Control** | Choose Secure Mode or AI Agent Mode per file during upload |
| **Granular Sharing** | Per-recipient cryptographic key wrapping + permission levels |
| **Automatic Lifecycle** | File and share expiry with proactive email warnings |
| **Modern Stack** | React 18 + FastAPI + Firestore — fast, scalable, maintainable |
| **Rich Analytics** | Actionable insights into storage, security status, and file trends |
| **Email Notifications** | Professional HTML emails for shares, expiry warnings, extension requests |
| **Single-Page App** | Smooth, responsive experience with no full page reloads |
| **Modular Architecture** | Clean separation of concerns; easy to extend and maintain |
| **Auto Key Management** | RSA keypair auto-generated; public key synced to user profiles |
| **Cross-Platform** | Web-based — works on any device with a modern browser |

---

## ⚠️ Limitations

| Limitation | Details |
|-----------|---------|
| **Server-Side Key Storage** | RSA private key stored on server filesystem; not hardware-secured (HSM) |
| **No End-to-End Encryption** | Encryption happens on the backend, not the client; the server momentarily holds plaintext |
| **No Client-Side Key Gen** | Users rely on the server's RSA keypair; no per-user key derivation on frontend |
| **Single Server Architecture** | Not horizontally scalable without RSA key synchronization |
| **100 MB Storage Quota** | Hardcoded storage limit per user (configurable but not dynamic) |
| **15-File Upload Limit** | Batch upload capped at 15 files per request |
| **No File Versioning** | Overwriting a filename replaces the existing file |
| **No Offline Access** | Requires network connectivity for all operations |
| **LLM Dependency** | Smart Search depends on HuggingFace API availability |
| **Gmail SMTP** | Email service limited to Gmail; daily send quotas apply |
| **No 2FA Enforcement** | Two-factor auth toggle exists in UI but is not yet functional |
| **Browser Compatibility** | Voice search requires Web Speech API (Chrome, Edge, Safari) |
| **PDF Agent Scope Rules** | PDF chatbot works only for PDFs with `advance_security = false` |

---

## 🔮 Future Scope

| Enhancement | Description | Priority |
|------------|-------------|----------|
| **Client-Side Encryption** | Encrypt files in the browser before uploading; true end-to-end | 🔴 High |
| **Hardware Security Modules** | HSM or AWS KMS for RSA private key protection | 🔴 High |
| **Per-User Key Pairs** | Each user generates their own RSA keypair on the client | 🔴 High |
| **Two-Factor Authentication** | TOTP-based 2FA with authenticator app support | 🟠 Medium |
| **File Versioning** | Track and restore previous file versions | 🟠 Medium |
| **Real-Time Collaboration** | WebSocket-based shared file editing / commenting | 🟡 Low |
| **Mobile Applications** | React Native or Flutter apps for iOS/Android | 🟠 Medium |
| **Role-Based Access Control** | Admin, editor, viewer roles with hierarchical permissions | 🟠 Medium |
| **Zero-Knowledge Proof Auth** | zk-SNARK based authentication for enhanced privacy | 🟡 Low |
| **Multi-Cloud Storage** | Support for Azure Blob, Google Cloud Storage alongside S3 | 🟡 Low |
| **Virus Scanning** | ClamAV integration for upload-time malware detection | 🟠 Medium |
| **Compression** | gzip/brotli compression before encryption for storage savings | 🟡 Low |
| **Kubernetes Deployment** | Container orchestration with Helm charts | 🟠 Medium |
| **Content Indexing** | Full-text search via decrypted content indexing | 🟡 Low |

---

## 📝 Conclusion

**CipherAI SecureCloud** demonstrates that building a **truly secure** cloud storage platform doesn't have to compromise on user experience. By combining:

- **AES-256-CBC + RSA-OAEP** encryption for military-grade file protection
- **AI-powered natural language search** for intuitive file discovery
- **Voice input** for hands-free operation
- **Per-recipient key re-wrapping** for cryptographically secure sharing
- **Automatic expiry management** for proactive security hygiene
- **Rich analytics** for visibility into storage and security posture

…the platform delivers a comprehensive solution that is **practical for real-world use** while maintaining the highest security standards.

CipherAI SecureCloud is not just a proof of concept — it's a **production-ready architecture** demonstrating how modern web technologies, cloud infrastructure, and AI capabilities can be orchestrated to solve real security challenges.

---

<div align="center">

**Built with 🔐 security and 🤖 intelligence at its core**

*CipherAI SecureCloud — Because your data deserves more than just a password.*

</div>
