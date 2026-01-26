# HamAI (BudgetAI) — Backend

This is the **Node/Express + Firebase Admin** backend API for HamAI.

## Responsibilities

- Verifies Firebase ID tokens (`/api/auth/verify`)
- Stores and retrieves transactions in Firestore
- Provides analytics/summary endpoints
- Parses “auto-entry feature” text (Gemini when configured, with fallback parsing)

## Local development

### 1) Install

```bash
cd backend
npm install
```

### 2) Configure environment

Create `backend/.env` (not committed). It contains both backend secrets and `REACT_APP_*` vars that will be synced into the frontend.

### 3) Run backend

```bash
npm run dev
```

Backend runs at `http://localhost:5001` (or `PORT`).

## Convenience scripts

From `backend/` you can run both apps:

```bash
npm run install-all
npm run dev:all
```

