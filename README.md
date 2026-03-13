<div align="center">

# 🔐 CipherAI SecureCloud

### AI-Powered Encrypted Cloud File Storage Platform

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![AWS S3](https://img.shields.io/badge/AWS-S3-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

> A comprehensive, security-first cloud storage solution that encrypts every file with **AES-256-CBC + RSA-OAEP** before storage, features **AI-powered natural language search** via LLM, and supports **secure file sharing** with per-recipient cryptographic key re-wrapping.

</div>

---

## 📋 Table of Contents

1.  [Introduction](#-introduction)
2.  [Problem Statement](#-problem-statement)
3.  [Proposed Solution](#-proposed-solution)
4.  [Key Features](#-key-features)
5.  [System Architecture](#-system-architecture)
6.  [Technology Stack](#-technology-stack)
7.  [User Roles](#-user-roles)
8.  [Workflow Explanation](#-workflow-explanation)
9.  [Project Structure](#-project-structure)
10. [Blockchain Smart Contract Design](#-blockchain-smart-contract-design)
11. [Database Design (MongoDB / Firestore)](#-database-design-mongodb--firestore)
12. [IPFS & Pinata Usage](#-ipfs--pinata-usage)
13. [Security Considerations](#-security-considerations)
14. [Local Development Setup](#-local-development-setup)
15. [How to Run the Project](#-how-to-run-the-project)
16. [Demo Instructions](#-demo-instructions)
17. [Use Cases](#-use-cases)
18. [Advantages of the System](#-advantages-of-the-system)
19. [Limitations](#-limitations)
20. [Future Scope](#-future-scope)
21. [Hackathon Context](#-hackathon-context)
22. [Team Contributions](#-team-contributions)
23. [Challenges Faced](#-challenges-faced)
24. [Conclusion](#-conclusion)
25. [References / Resources](#-references--resources)

---

## 🌟 Introduction

**CipherAI SecureCloud** is a full-stack encrypted cloud file storage platform designed with a **security-first** philosophy. Every file uploaded to the system is encrypted client-side in memory using **AES-256-CBC** symmetric encryption, with the AES key itself protected via **RSA-OAEP** asymmetric wrapping, before being stored on **AWS S3**. File metadata, encrypted keys, and user profiles are managed through **Google Cloud Firestore**, while authentication is handled by **Firebase Auth** (supporting email/password and Google OAuth).

What sets CipherAI SecureCloud apart is its **AI-powered Smart Search** capability — users can query their files using natural language (e.g., *"show me all PDFs uploaded last week"*), powered by a large language model (LLM) via HuggingFace Inference API. The system also supports **voice-based search** through the Web Speech API, **secure file sharing** with granular permissions and cryptographic key re-wrapping, **automatic file expiry** with email notifications, and a **rich analytics dashboard** with visual charts.

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
- "Apply to All" mode for batch configuration
- File preview (PDF via iframe, images inline)
- Download with automatic decryption
- Bulk operations: delete, move between tags, share
- Tag-based folder organization with 10 default categories

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
- **Password change**: With Firebase reauthentication
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
│  ┌──────────┐ ┌──────────┐ ┌▼─────────┐ ┌──────────────┐               │
│  │ auth.py  │ │ files.py │ │analytics │ │ smart_search │               │
│  │ /auth/*  │ │ /files/* │ │ /analytics│ │ /smart-search│               │
│  └──────────┘ └────┬─────┘ └──────────┘ └──────┬───────┘               │
│                     │                            │                        │
│  ┌─────────────────▼────────────────────────────▼───────────────────┐   │
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
2. Frontend → POST /upload/multiple (FormData: files + JSON metadata)
3. Backend for each file:
   a. Generate random 32-byte AES key + 16-byte IV
   b. PKCS7-pad plaintext → AES-256-CBC encrypt
   c. Encrypted blob = IV (16B) || ciphertext
   d. RSA-OAEP wrap AES key with server's public key → base64 encode
   e. Upload encrypted blob to S3: users/{uid}/files/{filename}.enc
   f. Store metadata + wrapped AES key in Firestore: user_files/{uid}:{filename}
4. Response: success with file count
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

### 4. Secure File Sharing Flow

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

### 5. Auto-Expiry Flow

```
Background thread (every 15 minutes):
1. Scan user_files where expiry_time ≤ now → delete from S3 + Firestore + shared
2. Scan user_files where expiry_time ≤ now + 24h → send warning email to owner
3. Scan shared_files where sharedExpiryTime ≤ now → delete share records
4. Scan shared_files where sharedExpiryTime ≤ now + 24h → send warning to shared user
```

### 6. AI Smart Search Flow

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
│   │   └── smart_search.py              # /smart-search (LLM-powered NL queries)
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

## ⛓️ Blockchain Smart Contract Design

> **Note:** The current implementation does not include blockchain integration. The architecture is designed to be **blockchain-ready** for future enhancements.

### Proposed Smart Contract Architecture

The system architecture supports future integration with **Ethereum/Polygon** smart contracts for immutable audit trails:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CipherAIAudit {
    struct FileRecord {
        bytes32 fileHash;           // SHA-256 hash of encrypted blob
        address owner;              // Ethereum address of file owner
        uint256 uploadTimestamp;    // Block timestamp of upload
        string ipfsHash;           // IPFS CID (if IPFS integration enabled)
        bool isActive;             // Whether file still exists
    }

    struct ShareRecord {
        bytes32 fileHash;           // Reference to the file
        address owner;              // File owner
        address recipient;          // Share recipient
        uint8 permission;           // 0 = view, 1 = download
        uint256 expiryTimestamp;    // Share expiry (0 = no expiry)
        bool isActive;
    }

    mapping(bytes32 => FileRecord) public files;
    mapping(bytes32 => ShareRecord[]) public shares;

    event FileUploaded(bytes32 indexed fileHash, address indexed owner, uint256 timestamp);
    event FileShared(bytes32 indexed fileHash, address indexed owner, address indexed recipient);
    event FileDeleted(bytes32 indexed fileHash, address indexed owner);
    event ShareRevoked(bytes32 indexed fileHash, address indexed recipient);

    function registerUpload(bytes32 _fileHash, string calldata _ipfsHash) external { ... }
    function registerShare(bytes32 _fileHash, address _recipient, uint8 _perm, uint256 _expiry) external { ... }
    function revokeFile(bytes32 _fileHash) external { ... }
    function verifyIntegrity(bytes32 _fileHash, bytes32 _currentHash) external view returns (bool) { ... }
}
```

### How Blockchain Would Enhance CipherAI

| Feature | Current (Firestore) | With Blockchain |
|---------|-------------------|----------------|
| **Audit Trail** | Mutable Firestore records | Immutable on-chain logs |
| **Integrity Verification** | Trust-based | Hash comparison against chain |
| **Share Provenance** | Database records | Cryptographic proof of sharing |
| **Deletion Proof** | Soft/hard delete | On-chain deletion event |
| **Dispute Resolution** | No verifiable history | Timestamped, tamper-proof logs |

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

### Entity Relationship Diagram

```
┌──────────────┐       1:N        ┌──────────────────┐
│    users     │─────────────────▶│   user_files     │
│              │                   │                  │
│  uid (PK)    │                   │  {uid}:{name}    │
│  email       │                   │  uid (FK→users)  │
│  public_key  │                   │  aes_key         │
│  name        │                   │  tag_id (FK→tags)│
│  lastLogin   │                   │  expiry_time     │
└──────────────┘                   └─────────┬────────┘
       │                                     │
       │ 1:N                                 │ 1:N
       ▼                                     ▼
┌──────────────────┐              ┌──────────────────┐
│  shared_files    │              │     tags         │
│                  │              │                  │
│  owner_id (FK)   │              │  tag_id (PK)    │
│  shared_user_id  │              │  tag_name       │
│  file_id (FK)    │              └──────────────────┘
│  aes_key_shared  │
│  permissions     │
│  sharedExpiryTime│
└──────────────────┘
```

---

## 🌐 IPFS & Pinata Usage

> **Note:** The current implementation uses **AWS S3** for file storage. IPFS/Pinata integration is part of the **future roadmap**.

### Proposed IPFS Integration Architecture

```
Current:   File → AES Encrypt → AWS S3 (centralized)
Proposed:  File → AES Encrypt → IPFS via Pinata (decentralized) + CID on-chain
```

### How IPFS Would Be Used

| Component | Current | With IPFS/Pinata |
|-----------|---------|-----------------|
| **Storage** | AWS S3 bucket | IPFS network (pinned via Pinata) |
| **File Reference** | S3 key path | IPFS Content Identifier (CID) |
| **Availability** | Single cloud provider | Distributed peer-to-peer network |
| **Integrity** | Trust AWS | Content-addressed (hash = address) |
| **Pinning** | N/A | Pinata ensures permanent availability |

### Proposed Integration Points

1. **Upload**: After AES encryption, pin the encrypted blob to IPFS via Pinata API → store CID in Firestore
2. **Download**: Retrieve encrypted blob from IPFS gateway using CID → decrypt in memory
3. **Verification**: Compare CID (content hash) against blockchain record for integrity proof
4. **Deletion**: Unpin from Pinata (content may still exist on IPFS network)

---

## 🛡️ Security Considerations

### Encryption Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  ENCRYPTION PIPELINE                     │
│                                                          │
│  Plaintext File                                          │
│       │                                                  │
│       ▼                                                  │
│  ┌──────────────────────────────┐                       │
│  │  Generate Random AES Key     │  32 bytes (256 bits)  │
│  │  Generate Random IV          │  16 bytes (128 bits)  │
│  └──────────────┬───────────────┘                       │
│                  │                                        │
│       ┌──────────┴──────────┐                            │
│       ▼                     ▼                            │
│  ┌──────────┐     ┌──────────────────┐                  │
│  │ PKCS7 Pad│     │ RSA-OAEP Wrap    │                  │
│  │ → AES-CBC│     │ AES Key with     │                  │
│  │ Encrypt  │     │ Server's RSA Pub │                  │
│  └────┬─────┘     └────────┬─────────┘                  │
│       │                     │                            │
│       ▼                     ▼                            │
│  ┌──────────┐     ┌──────────────────┐                  │
│  │ IV ‖ CT  │     │ Base64-encoded   │                  │
│  │ → S3     │     │ wrapped key      │                  │
│  │ (.enc)   │     │ → Firestore      │                  │
│  └──────────┘     └──────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### Security Features Implemented

| Feature | Implementation |
|---------|---------------|
| **Encryption Standard** | AES-256-CBC (NIST approved) |
| **Key Wrapping** | RSA-2048 OAEP with SHA-256 + MGF1 |
| **Key Separation** | Encrypted data (S3) separated from encrypted keys (Firestore) |
| **Per-File Keys** | Every file gets a unique random AES key |
| **Zero Disk Plaintext** | All encryption/decryption happens in-memory |
| **Authentication** | Firebase ID token verification on every request |
| **Token Validation** | Server-side Firebase Admin SDK verification |
| **Share Key Isolation** | AES key re-wrapped per recipient (no shared secrets) |
| **Permission Enforcement** | View-only users cannot trigger download endpoints |
| **Filename Sanitization** | Regex-based sanitization prevents path traversal |
| **CORS** | Configurable allowed origins |
| **Auto Cleanup** | Expired files automatically removed from all storage |
| **PKCS7 Padding** | Standard block cipher padding (prevents oracle attacks when implemented correctly) |

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| **S3 breach** | Files are AES-256-CBC encrypted; attacker gets ciphertext only |
| **Firestore breach** | AES keys are RSA-OAEP wrapped; requires private key to unwrap |
| **Network interception** | HTTPS + Firebase ID tokens; no plaintext in transit |
| **Unauthorized access** | Firebase Auth + server-side token validation |
| **Share abuse** | Permission-level enforcement + optional share expiry |
| **Stale data** | Auto-expiry daemon cleans up files + shares |
| **Path traversal** | Filename sanitization before S3 key construction |

---

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

# HuggingFace API (for Smart Search)
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
   - **Advance Security**: Toggle enhanced security mode
4. Use **"Apply to All"** to set the same metadata for all files
5. Click **"Upload & Encrypt"** — each file is AES-256 encrypted and stored

### 3. Preview & Download Files

1. Navigate to **My Files** → click a folder or view untagged files
2. Click any file to open the **Preview Overlay**
3. PDFs render inline; images display directly
4. Click **"Download"** to get the decrypted file

### 4. Share a File

1. Preview a file → click the **"Share"** button
2. Search for a user by **email address**
3. Select **permissions**: View Only or View & Download
4. Optionally set a **share expiry date**
5. Click **"Share"** — the recipient receives an email notification

### 5. View Shared Files

1. Navigate to **"Shared with me"** in the sidebar
2. View files shared by others with owner info and permission badges
3. Click to preview; download if permission allows
4. Request an **expiry extension** if access is about to expire

### 6. AI Smart Search

1. Navigate to **"Smart Search"** in the sidebar
2. Try natural language queries:
   - *"Show me all PDF files"*
   - *"Files uploaded in the last week"*
   - *"Medical records shared with me"*
   - *"Large files over 5MB"*
3. Click the **microphone icon** for voice search
4. Click any result to preview the file

### 7. Analytics Dashboard

1. Navigate to **"Analytics"** in the sidebar
2. Explore:
   - Total file count and storage usage
   - Upload activity over 30 days
   - File type distribution pie chart
   - Storage breakdown by folder
   - Security metrics
   - Expiring files dashboard

### 8. Account Settings

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
A law firm manages confidential case files. Documents are encrypted and organized by case under custom tags. Sharing with external counsel uses **permission-controlled** access with **expiry dates**. The audit trail (future blockchain integration) provides compliance evidence.

### 3. Financial Services
An accountant manages tax returns and financial statements. Files are tagged under **"Finance"**, **"Tax Records"**, and **"Bank Documents"**. Smart Search helps quickly find *"all tax returns from 2024"* using natural language.

### 4. Education
Students and professors securely share academic materials. Research papers, thesis drafts, and study materials are organized under **"Academics"** with controlled sharing.

### 5. Personal Document Vault
Individuals store sensitive personal documents — IDs, passports, insurance policies — in an encrypted vault. **Auto-expiry** helps clean up temporary documents, and **voice search** enables quick, hands-free file retrieval.

### 6. Enterprise File Sharing
Teams share confidential business documents with **granular permissions**. The analytics dashboard helps monitor file distribution, and the expiry system ensures temporary access is automatically revoked.

---

## ✅ Advantages of the System

| Advantage | Description |
|-----------|-------------|
| **Military-Grade Encryption** | AES-256-CBC + RSA-2048 OAEP — the same standards used by governments |
| **Zero-Knowledge Storage** | Plaintext never reaches S3; even a storage breach yields useless ciphertext |
| **AI-Powered UX** | Natural language and voice search lower the barrier to finding files |
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

---

## 🔮 Future Scope

| Enhancement | Description | Priority |
|------------|-------------|----------|
| **Client-Side Encryption** | Encrypt files in the browser before uploading; true end-to-end | 🔴 High |
| **Blockchain Audit Trail** | Ethereum/Polygon smart contracts for immutable file/share logs | 🔴 High |
| **IPFS / Pinata Storage** | Decentralized storage with content-addressing | 🟠 Medium |
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

## 🏆 Hackathon Context

CipherAI SecureCloud was developed as a hackathon project to demonstrate how **modern cryptography**, **AI capabilities**, and **cloud infrastructure** can be combined to build a practical, security-first file storage solution.

### Problem Domain

The project addresses the intersection of:
- **Cloud Security** — ensuring data confidentiality in multi-tenant cloud environments
- **AI/ML Integration** — leveraging LLMs for enhanced user experience
- **Cryptographic Engineering** — implementing real-world encryption pipelines

### Innovation Highlights

1. **LLM-Powered File Search**: Natural language queries translated to database operations via schema-aware prompting — a novel approach to file discovery
2. **Cryptographic Sharing**: Per-recipient AES key re-wrapping ensures that sharing a file doesn't expose the encryption key to any intermediary
3. **Voice-Driven UX**: Web Speech API integration with real-time audio visualization for hands-free file search
4. **Proactive Security**: Auto-expiry daemon with email warning pipeline prevents stale access and reduces attack surface

### Judging Criteria Alignment

| Criteria | How CipherAI Addresses It |
|---------|--------------------------|
| **Innovation** | AI smart search + voice input + LLM query translation |
| **Technical Complexity** | AES-256 + RSA-OAEP encryption pipeline, background daemon, query fallback strategy |
| **Completeness** | Full CRUD, sharing, analytics, settings, email notifications |
| **Security** | Military-grade encryption, per-file keys, token auth, permission enforcement |
| **Usability** | Clean dark-themed UI, drag-and-drop uploads, inline previews |
| **Scalability** | Modular FastAPI backend, Firestore NoSQL, S3 object storage |

---

## 👥 Team Contributions

| Team Member | Contributions |
|------------|---------------|
| **Member 1** | Backend architecture, encryption pipeline (AES-256-CBC + RSA-OAEP), FastAPI routes, S3 integration |
| **Member 2** | Frontend development (React + Vite), UI/UX design, component architecture, responsive layouts |
| **Member 3** | Firebase Auth integration, Firestore schema design, Smart Search (LLM + voice), analytics dashboard |
| **Member 4** | File sharing system, email notification service, expiry management daemon, testing & documentation |

> *Update the table above with actual team member names and specific contributions.*

---

## 🧩 Challenges Faced

### 1. In-Memory Encryption at Scale
**Challenge:** Encrypting/decrypting files entirely in memory without any temporary disk I/O, especially for large files.
**Solution:** Used Python's `bytes` operations with streaming-aware buffer management. The `encrypt_bytes()` and `decrypt_bytes()` functions operate on the complete byte array in-memory, trading memory for security (no plaintext on disk).

### 2. Firestore Composite Index Limitations
**Challenge:** The AI Smart Search generates complex Firestore queries with multiple filters + ordering, which require pre-built composite indexes.
**Solution:** Implemented a **3-tier query fallback strategy**: (1) full query with all filters + order_by, (2) filters only (no order_by), (3) equality filters only + in-memory range filtering. This gracefully handles missing indexes without failing.

### 3. RSA Key Wrapping for File Sharing
**Challenge:** When sharing a file, the AES key (wrapped with the owner's public key) must be made accessible to the recipient without exposing the raw key.
**Solution:** Implemented **key re-wrapping**: the server unwraps the AES key using the private key, then re-wraps it with the recipient's public key. Each share record stores an independently wrapped copy of the AES key.

### 4. Cross-Origin Google OAuth Popups
**Challenge:** Google OAuth popup sign-in blocked by `Cross-Origin-Opener-Policy` headers in Vite dev server.
**Solution:** Configured Vite with a custom `Cross-Origin-Opener-Policy: same-origin-allow-popups` header to allow Firebase Auth popup flows.

### 5. Background Expiry Cleanup
**Challenge:** Running periodic cleanup tasks in a FastAPI application without blocking request handling.
**Solution:** Used a Python **daemon thread** that starts on application startup (`@app.on_event("startup")`), runs every 15 minutes, and cleanly handles Firestore/S3 deletions with error isolation per file.

### 6. LLM Response Parsing
**Challenge:** The HuggingFace LLM doesn't always return perfectly formatted JSON for Firestore queries.
**Solution:** Robust JSON extraction with regex-based cleanup of markdown code fences, multiple parse attempts, and graceful error messages when the LLM output cannot be parsed.

### 7. Email Deliverability
**Challenge:** Gmail SMTP requires App Passwords (not regular passwords) and has daily sending limits.
**Solution:** Document the App Password setup process, implement async-safe email sending with error handling that doesn't crash the main request flow, and use professional HTML templates to avoid spam filters.

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

The modular architecture — with clear separation between encryption core, API routes, background services, and frontend components — makes the system **extensible** and ready for future enhancements like blockchain audit trails, IPFS decentralized storage, and client-side encryption.

CipherAI SecureCloud is not just a proof of concept — it's a **production-ready architecture** demonstrating how modern web technologies, cloud infrastructure, and AI capabilities can be orchestrated to solve real security challenges.

---

## 📚 References / Resources

### Cryptography & Security
- [AES-256-CBC — NIST SP 800-38A](https://csrc.nist.gov/publications/detail/sp/800-38a/final)
- [RSA-OAEP — RFC 8017](https://tools.ietf.org/html/rfc8017)
- [Python `cryptography` Library Documentation](https://cryptography.io/en/latest/)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)

### Firebase & Google Cloud
- [Firebase Authentication Documentation](https://firebase.google.com/docs/auth)
- [Cloud Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Admin Python SDK](https://firebase.google.com/docs/admin/setup)

### AWS
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Boto3 Python SDK](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)

### Frontend
- [React 18 Documentation](https://react.dev/)
- [Vite Build Tool](https://vitejs.dev/)
- [React Router v6](https://reactrouter.com/)
- [Recharts Library](https://recharts.org/)
- [Lucide Icons](https://lucide.dev/)

### AI & Machine Learning
- [HuggingFace Inference API](https://huggingface.co/docs/api-inference/)
- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)

### Backend Framework
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Uvicorn ASGI Server](https://www.uvicorn.org/)
- [Pydantic Data Validation](https://docs.pydantic.dev/)

### Blockchain (Future Reference)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [Ethereum Developer Resources](https://ethereum.org/en/developers/)
- [IPFS Documentation](https://docs.ipfs.io/)
- [Pinata IPFS Pinning](https://docs.pinata.cloud/)

---

<div align="center">

**Built with 🔐 security and 🤖 intelligence at its core**

*CipherAI SecureCloud — Because your data deserves more than just a password.*

</div>