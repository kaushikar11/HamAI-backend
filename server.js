import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import authRoutes from './routes/auth.js';
import budgetRoutes from './routes/budget.js';
import './firebase-admin.js'; // Initialize Firebase Admin and Firestore

// Load .env from root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));

// Rate limiting - exclude /api/auth/me completely
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Very high limit for general API
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for auth check endpoint (called frequently on every page load)
    const url = (req.originalUrl || req.url || '').toLowerCase();
    return url.includes('/api/auth/me');
  }
});

// Stricter rate limiting for specific auth endpoints only (login, register, google)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Increased limit
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
  skip: (req) => {
    // Skip rate limiting for /me endpoint and other non-sensitive endpoints
    const url = (req.originalUrl || req.url || '').toLowerCase();
    return url.includes('/api/auth/me') || url.includes('/api/auth/logout');
  }
});

// Apply rate limiters - but exclude /api/auth/me route entirely
app.use((req, res, next) => {
  const url = (req.originalUrl || req.url || '').toLowerCase();
  if (url.includes('/api/auth/me')) {
    return next(); // Skip all rate limiting for /api/auth/me
  }
  next();
});

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// CORS configuration for sessions
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:5001'],
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
} else {
  // In production, allow your domain
  app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

// Note: No longer using MongoDB, so mongoSanitize is not needed
// Firestore handles data validation through its own security rules

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes (must come before static files)
// Note: /api/auth/me should be accessible without strict rate limiting
app.use('/api/auth', authRoutes);
app.use('/api/budget', budgetRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'BudgetAI API is running' });
});

// Check if frontend build exists
const buildPath = path.join(__dirname, '../frontend/build');
const buildExists = existsSync(buildPath);

if (buildExists) {
  // Serve static files from the React app
  app.use(express.static(buildPath));

  // The "catchall" handler: for any request that doesn't match an API route,
  // send back React's index.html file (for React Router)
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  // If build doesn't exist, show helpful message
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API route not found' });
    }
    res.status(503).json({ 
      message: 'Frontend build not found. Please run: npm run build',
      error: 'Build directory missing'
    });
  });
}

// Firebase/Firestore is initialized in firebase-admin.js
// No connection needed - Firestore is serverless
console.log('✓ Using Firestore database');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Auto-open browser in development
  if (process.env.NODE_ENV !== 'production' && !process.env.NO_OPEN) {
    const url = `http://localhost:${PORT}`;
    const command = process.platform === 'win32' 
      ? `start ${url}` 
      : process.platform === 'darwin' 
      ? `open ${url}` 
      : `xdg-open ${url}`;
    
    setTimeout(() => {
      exec(command, (error) => {
        if (error) {
          console.log(`\nServer ready! Open ${url} in your browser`);
        }
      });
    }, 1000);
  }
});
