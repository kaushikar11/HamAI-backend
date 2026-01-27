# HamAI Backend API

A production-ready Node.js/Express backend API for HamAI, a modern budgeting application with AI-powered transaction parsing capabilities.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Security](#security)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

HamAI Backend is a RESTful API service that powers the HamAI budgeting application. It provides secure authentication, transaction management, AI-powered text parsing, and comprehensive analytics. Built with Express.js and integrated with Firebase Admin SDK for authentication and Firestore for data persistence.

## ✨ Features

### Authentication & Authorization
- Firebase ID token verification
- Secure user session management
- Protected API routes with middleware
- User profile management

### Transaction Management
- Create, read, update, and delete budget entries
- Monthly transaction organization
- Support for multiple items per transaction
- Automatic categorization
- Tax and subtotal calculations

### AI-Powered Parsing
- **Google Gemini AI Integration**: Intelligent text parsing from receipts and transaction notes
- **Fallback Parser**: Robust local parsing when AI is unavailable
- Automatic extraction of:
  - Store/receiver names
  - Item names and prices
  - Tax amounts
  - Categories
  - Totals and subtotals

### Analytics & Reporting
- Monthly summary statistics
- Category-wise spending breakdown
- Total, subtotal, and tax calculations
- Customizable date range queries

### User Preferences
- Custom category management
- Receiver name management
- Persistent user settings
- Category color assignments

### Security Features
- Rate limiting on API endpoints
- Helmet.js for security headers
- CORS configuration
- Input validation and sanitization
- Firebase Admin SDK for secure token verification

## 🛠 Tech Stack

### Core Technologies
- **Node.js** (v18+ recommended)
- **Express.js** (v4.18.2) - Web framework
- **Firebase Admin SDK** (v13.6.0) - Authentication and Firestore
- **Google Gemini AI** (v0.24.1) - AI text parsing

### Security & Validation
- **Helmet** (v7.1.0) - Security headers
- **CORS** (v2.8.5) - Cross-origin resource sharing
- **express-validator** (v7.0.1) - Input validation
- **express-rate-limit** (v7.1.5) - Rate limiting

### Development Tools
- **Nodemon** (v3.0.2) - Auto-reload during development
- **dotenv** (v16.3.1) - Environment variable management
- **concurrently** (v9.2.1) - Run multiple processes

### Database
- **Google Cloud Firestore** - NoSQL document database

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher) or **yarn**
- **Firebase Project** with:
  - Authentication enabled
  - Firestore database initialized
  - Service account key generated
- **Google Gemini API Key** (optional, for AI features)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd BudgetAI/backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install All Dependencies (Frontend + Backend)

From the `backend/` directory:

```bash
npm run install-all
```

This will install dependencies for both backend and frontend.

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
cp .env.example .env  # If you have an example file
# Or create .env manually
```

### Required Environment Variables

```env
# Server Configuration
PORT=5001
SESSION_SECRET=your_session_secret_key_here

# Firebase Admin SDK
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
# Note: This should be a single-line JSON string or properly escaped multi-line JSON

# Google Gemini API (Optional - for AI parsing)
GEMINI_API_KEY=your_gemini_api_key_here

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Frontend API URLs (synced to frontend/.env)
REACT_APP_API_URL_LOCAL=http://localhost:5001/api
REACT_APP_API_URL_PROD=https://your-backend-url.vercel.app/api

# Firebase Frontend Configuration (synced to frontend/.env)
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

### Firebase Service Account Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Copy the JSON content and paste it as a single-line string in `FIREBASE_SERVICE_ACCOUNT_KEY`

**Important**: The service account key must be a valid JSON string. For multi-line JSON, ensure proper escaping or use a single-line format.

## 🏃 Running Locally

### Development Mode (Backend Only)

```bash
npm run dev
```

The server will start on `http://localhost:5001` (or your configured PORT).

### Development Mode (Backend + Frontend)

From the `backend/` directory:

```bash
npm run dev:all
```

This will:
1. Sync environment variables to frontend
2. Start the backend server with nodemon
3. Start the frontend development server

- **Backend**: `http://localhost:5001`
- **Frontend**: `http://localhost:3000`

### Production Mode

```bash
npm start
```

### Sync Environment Variables

To sync `REACT_APP_*` variables to the frontend:

```bash
npm run sync-env
```

## 📁 Project Structure

```
backend/
├── api/
│   └── index.js              # Vercel serverless function entry point
├── middleware/
│   └── auth.js                # Firebase token verification middleware
├── models/
│   ├── BudgetEntry.js         # Budget entry data model
│   ├── User.js                # User data model
│   └── UserPreferences.js     # User preferences model
├── routes/
│   ├── auth.js                # Authentication routes
│   └── budget.js              # Budget/transaction routes
├── services/
│   └── geminiService.js       # AI parsing service (Gemini + fallback)
├── utils/
│   └── sanitize.js            # Input sanitization utilities
├── firebase-admin.js          # Firebase Admin SDK initialization
├── server.js                  # Express server setup
├── sync-env.cjs              # Environment variable sync script
├── vercel.json               # Vercel deployment configuration
├── package.json
└── .env                      # Environment variables (not committed)
```

## 📚 API Documentation

### Base URL

- **Local**: `http://localhost:5001/api`
- **Production**: `https://your-backend-url.vercel.app/api`

### Authentication

All protected routes require a Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <firebase_id_token>
```

### Endpoints

#### Authentication

##### `POST /api/auth/verify`
Verify Firebase ID token and get user information.

**Request Body:**
```json
{
  "token": "firebase_id_token"
}
```

**Response:**
```json
{
  "valid": true,
  "userId": "user_id",
  "email": "user@example.com",
  "name": "User Name"
}
```

##### `GET /api/auth/me`
Get current user information.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "userId": "user_id",
  "email": "user@example.com",
  "name": "User Name"
}
```

##### `POST /api/auth/set-name`
Update user's display name.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "New Name"
}
```

#### Budget Entries

##### `GET /api/budget/stats/summary?month={month}&year={year}`
Get monthly summary statistics.

**Query Parameters:**
- `month` (required): Month number (1-12)
- `year` (required): Year (e.g., 2026)

**Response:**
```json
{
  "total": 1500.00,
  "subtotal": 1400.00,
  "tax": 100.00,
  "entryCount": 10,
  "entries": [...]
}
```

##### `POST /api/budget`
Create a new budget entry.

**Request Body:**
```json
{
  "receiver": "Store Name",
  "category": "grocery",
  "items": [
    { "name": "Item 1", "amount": 10.00 },
    { "name": "Item 2", "amount": 20.00 }
  ],
  "subtotal": 30.00,
  "tax": 2.40,
  "total": 32.40,
  "month": 1,
  "year": 2026,
  "notes": "Optional notes"
}
```

##### `GET /api/budget/:id`
Get a specific budget entry.

##### `PUT /api/budget/:id?month={month}&year={year}`
Update a budget entry.

**Request Body:** (same as POST, all fields optional)

##### `DELETE /api/budget/:id?month={month}&year={year}`
Delete a budget entry.

#### AI Parsing

##### `POST /api/budget/parse`
Parse transaction text using AI.

**Request Body:**
```json
{
  "text": "Walmart\nPotatoes 1 bag $15\nTax $1.20\nTotal $16.20"
}
```

**Response:**
```json
{
  "store": "Walmart",
  "items": [
    { "name": "Potatoes 1 bag", "amount": 15.00 }
  ],
  "tax": 1.20,
  "subtotal": 15.00,
  "total": 16.20,
  "category": "grocery"
}
```

#### Categories & Receivers

##### `GET /api/budget/categories`
Get user's categories.

**Response:**
```json
{
  "categories": ["grocery", "utilities", "rent", ...]
}
```

##### `GET /api/budget/receivers`
Get user's receiver names.

**Response:**
```json
{
  "receivers": ["store", "supermarket", "online", ...]
}
```

## 🔐 Security

### Security Features

1. **Firebase Token Verification**: All protected routes verify Firebase ID tokens
2. **Rate Limiting**: API endpoints are rate-limited to prevent abuse
3. **Helmet.js**: Security headers are automatically set
4. **CORS**: Configured to allow only trusted origins
5. **Input Validation**: All inputs are validated using express-validator
6. **Input Sanitization**: User inputs are sanitized to prevent injection attacks

### Best Practices

- Never commit `.env` files
- Use strong session secrets in production
- Regularly rotate API keys
- Keep dependencies updated
- Use HTTPS in production
- Implement proper error handling (don't expose sensitive information)

## 🚢 Deployment

### Vercel Deployment

The backend is configured for Vercel serverless functions.

1. **Install Vercel CLI**:
```bash
npm i -g vercel
```

2. **Deploy**:
```bash
cd backend
vercel
```

3. **Set Environment Variables**:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all variables from your `.env` file
   - For `FIREBASE_SERVICE_ACCOUNT_KEY`, paste the entire JSON as a single-line string

4. **Deploy to Production**:
```bash
vercel --prod
```

### Environment Variables on Vercel

Ensure all environment variables from `.env` are set in Vercel:
- `FIREBASE_SERVICE_ACCOUNT_KEY` (as single-line JSON)
- `GEMINI_API_KEY`
- `FRONTEND_URL`
- All `REACT_APP_*` variables

## 🧪 Testing

### Manual Testing

Use tools like Postman, curl, or Thunder Client to test endpoints:

```bash
# Test health endpoint
curl http://localhost:5001/api/health

# Test authentication
curl -X POST http://localhost:5001/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "your_firebase_token"}'
```

### Automated Testing

Add test scripts to `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### Firebase Admin Initialization Error
**Error**: `Expected property name or '}' in JSON`

**Solution**: Ensure `FIREBASE_SERVICE_ACCOUNT_KEY` is a valid single-line JSON string. For multi-line JSON, use proper escaping or convert to single-line.

#### Port Already in Use
**Error**: `EADDRINUSE: address already in use`

**Solution**: Change the `PORT` in `.env` or kill the process using the port:
```bash
lsof -ti:5001 | xargs kill -9
```

#### CORS Errors
**Error**: `Access to XMLHttpRequest has been blocked by CORS policy`

**Solution**: Ensure `FRONTEND_URL` in `.env` matches your frontend URL exactly.

#### Gemini API Errors
**Error**: `API key not valid`

**Solution**: 
- Verify `GEMINI_API_KEY` is correct
- Check API key permissions in Google Cloud Console
- Ensure billing is enabled for your Google Cloud project

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use ES6+ JavaScript features
- Follow Express.js best practices
- Add comments for complex logic
- Keep functions small and focused
- Use async/await for asynchronous operations

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For issues, questions, or contributions, please open an issue on the repository.

---

**Built with ❤️ for modern budgeting**
