# 📰 ArticleX — 100% Firebase Stack

A full-stack article platform with **zero Node/Express servers to manage**.
Everything runs on Firebase.

| Layer | Firebase Service |
|---|---|
| **Auth** | Firebase Authentication (Email/Password + Google) |
| **Database** | Cloud Firestore |
| **API** | Cloud Functions (Express inside a single HTTPS function) |
| **File storage** | Firebase Storage (cover images + avatars) |
| **Hosting** | Firebase Hosting (CDN, global edge) |

---

## 📁 Project Structure

```
articlex-full-firebase/
│
├── frontend/                    ← Static files → Firebase Hosting
│   ├── index.html               Home feed, search, tag filter, pagination
│   ├── article.html             Article detail, comments, like, bookmark
│   ├── write.html               Write / edit + Firebase Storage image upload
│   ├── login.html               Email/password + Google Sign-In
│   ├── signup.html              Registration + Google Sign-Up
│   ├── profile.html             Profile, avatar upload, bookmarks, edit modal
│   ├── style.css                Full design system (dark mode, responsive)
│   └── script.js                Firebase init, Auth helpers, API client, utils
│
├── functions/                   ← Cloud Functions → deployed as "api"
│   ├── index.js                 Function entry point (exports `api`)
│   ├── app.js                   Express app wiring
│   ├── middleware/
│   │   └── auth.js              Token verification + Firestore profile upsert
│   ├── routes/
│   │   ├── auth.js              GET/PUT/DELETE /api/auth/me
│   │   └── articles.js          Full article CRUD + social endpoints
│   ├── controllers/
│   │   ├── authController.js    Profile management
│   │   └── articleController.js Articles, likes, bookmarks, comments
│   └── package.json
│
├── firestore.rules              Security rules (auth-gated writes)
├── firestore.indexes.json       Composite indexes for tag + date queries
├── storage.rules                Storage rules (authenticated uploads only)
├── firebase.json                Hosting + Functions + Firestore + Storage config
└── .firebaserc                  Project alias
```

---

## ⚡ Quick Start (5 steps)

### 1 — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Enable **Firestore** → *Start in production mode* (rules are in `firestore.rules`)
3. Enable **Authentication** → Sign-in providers → **Email/Password** + **Google**
4. Enable **Storage** → *Start in production mode* (rules are in `storage.rules`)
5. **Upgrade to Blaze plan** (pay-as-you-go) — required for Cloud Functions outbound calls.
   The free tier is very generous; a typical dev project costs $0/month.

---

### 2 — Paste your Firebase config into `frontend/script.js`

```
Firebase Console → Project Settings → Your apps → Web → SDK setup & configuration
```

Replace the placeholder in **`frontend/script.js`** (top of file):

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",
  authDomain:        "my-project.firebaseapp.com",
  projectId:         "my-project",
  storageBucket:     "my-project.appspot.com",
  messagingSenderId: "123456",
  appId:             "1:123:web:abc",
};
```

---

### 3 — Set your project ID

**`.firebaserc`:**
```json
{ "projects": { "default": "your-firebase-project-id" } }
```

---

### 4 — Install dependencies & deploy

```bash
# Install Firebase CLI globally (once)
npm install -g firebase-tools

# Login
firebase login

# Install Cloud Functions dependencies
cd functions && npm install && cd ..

# Deploy everything in one command
firebase deploy
```

That's it. Firebase CLI will deploy:
- `frontend/` → Firebase Hosting (CDN)
- `functions/` → Cloud Functions
- `firestore.rules` + `firestore.indexes.json` → Firestore
- `storage.rules` → Firebase Storage

Your app is live at `https://YOUR_PROJECT_ID.web.app` 🎉

---

### 5 — Local development with emulators

```bash
# Install function deps
cd functions && npm install && cd ..

# Start all emulators
firebase emulators:start
```

Then update `API_BASE` in `frontend/script.js` for local dev:

```js
// Local emulators
const API_BASE = 'http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/api';

// Production (hosting rewrite handles this automatically)
// const API_BASE = '/api';
```

Open the emulator UI at [http://127.0.0.1:4000](http://127.0.0.1:4000) to inspect
Firestore documents, auth users, and function logs in real time.

---

## 🔌 API Reference

All endpoints live under `/api` and are served by the `api` Cloud Function.

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`    | `/api/auth/me`  | ✅ | Get or lazy-create your Firestore profile |
| `PUT`    | `/api/auth/me`  | ✅ | Update username / bio / avatar |
| `DELETE` | `/api/auth/me`  | ✅ | Delete account + all articles |

### Articles
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`    | `/api/articles`                         | —  | List articles |
| `GET`    | `/api/articles/tags`                    | —  | All unique tags |
| `GET`    | `/api/articles/:id`                     | —  | Single article + comments |
| `POST`   | `/api/articles`                         | ✅ | Create article |
| `PUT`    | `/api/articles/:id`                     | ✅ | Update article (owner) |
| `DELETE` | `/api/articles/:id`                     | ✅ | Delete article (owner) |
| `POST`   | `/api/articles/:id/like`                | ✅ | Toggle like |
| `POST`   | `/api/articles/:id/bookmark`            | ✅ | Toggle bookmark |
| `POST`   | `/api/articles/:id/comments`            | ✅ | Add comment |
| `DELETE` | `/api/articles/:id/comments/:commentId` | ✅ | Delete comment (owner) |

**GET /api/articles query params:**
- `search` — full-text search on title / content / excerpt
- `tag` — filter by tag (e.g. `?tag=technology`)
- `authorId` — filter by author's Firebase UID
- `page` — page number (default: 1)
- `limit` — page size (default: 9, max: 50)

---

## 🗄️ Firestore Data Model

```
/users/{uid}
  uid, email, username, bio, avatar, bookmarks[], createdAt, updatedAt

/articles/{articleId}
  title, content, excerpt, image, tags[], authorId,
  likes[], likeCount, views, readTime, createdAt, updatedAt

  /comments/{commentId}
    content, authorId, username, avatar, createdAt
```

---

## 🔐 Auth Architecture

```
Browser                Firebase Auth        Cloud Function       Firestore
  │                         │                    │                   │
  │── signInWithEmail ──────▶│                    │                   │
  │◀── Firebase ID Token ───│                    │                   │
  │                         │                    │                   │
  │── GET /api/auth/me ──────────────────────────▶                   │
  │   Bearer <ID_TOKEN>     │                    │                   │
  │                         │◀── verifyIdToken ──│                   │
  │                         │──── decoded uid ──▶│                   │
  │                         │                    │── upsert user ───▶│
  │◀── Firestore profile ───────────────────────│◀──────────────────│
```

- **No passwords in Firestore** — Firebase Auth owns all credentials
- **Lazy registration** — Firestore profile is created on first API call
- **Tokens auto-refresh** — Firebase SDK handles silent token refresh (1 hr expiry)
- **Google Sign-In** — works identically, same lazy-registration flow

---

## 📦 Firebase Storage Layout

```
/covers/{uid}/{timestamp}.{ext}   ← article cover images (max 5 MB)
/avatars/{uid}/avatar.{ext}       ← profile pictures (max 2 MB)
```

Images are uploaded directly from the browser using the Firebase Storage SDK.
The resulting download URL is stored in Firestore with the article/user document.

---

## ✨ Feature Summary

| Feature | Implementation |
|---------|---------------|
| Email/Password auth | Firebase Auth |
| Google Sign-In | Firebase Auth popup |
| Password reset email | `auth.sendPasswordResetEmail()` |
| Profile CRUD | Firestore `/users` + Cloud Function |
| Article CRUD | Firestore `/articles` + Cloud Function |
| Comments | Firestore sub-collection `/articles/{id}/comments` |
| Likes | Firestore `arrayUnion/arrayRemove` atomic update |
| Bookmarks | Stored in user document |
| Cover image upload | Firebase Storage + drag-and-drop |
| Avatar upload | Firebase Storage, click-to-upload |
| Full-text search | Client-side filter (upgrade: Algolia Extension) |
| Tag filter | Firestore `array-contains` query |
| Pagination | Firestore cursor-based |
| Dark / Light mode | CSS variables + localStorage |
| Draft autosave | localStorage |
| Read time estimate | Word count ÷ 200 |
| Loading skeletons | CSS animation |
| Toast notifications | Custom JS |
| Markdown preview | Client-side renderer |

---

## 🔧 Upgrading Full-Text Search

The built-in search filters results client-side, which is fine for thousands of articles.
For larger scale, install the official
[Algolia Firebase Extension](https://extensions.dev/extensions/algolia/firestore-algolia-search)
which auto-indexes Firestore writes into Algolia — no code changes needed.
