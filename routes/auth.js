import express from 'express';
import * as User from '../models/User.js';
import admin from '../firebase-admin.js';

const router = express.Router();

// Middleware to verify Firebase token
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Get or create user from Firebase token
router.post('/verify', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email, name, picture } = req.user;
    const bodyName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

    // If token doesn't contain name (common for email/password), try Firebase user record
    let firebaseProfileName = '';
    try {
      const fbUser = await admin.auth().getUser(uid);
      firebaseProfileName = (fbUser?.displayName || '').trim();
    } catch (e) {
      // ignore
    }

    const resolvedName = (name && String(name).trim())
      || firebaseProfileName
      || bodyName
      || 'User';
    
    // Find or create user in Firestore
    let user = await User.getUserByFirebaseUid(uid);
    
    if (!user) {
      // Create new user
      user = await User.createUser({
        firebaseUid: uid,
        email: email || '',
        name: resolvedName,
        photoURL: picture || null
      });
    } else {
      // Update user info if changed
      const updates = {};
      if (resolvedName && user.name !== resolvedName) updates.name = resolvedName;
      if (email && user.email !== email.toLowerCase()) updates.email = email.toLowerCase();
      if (picture && user.photoURL !== picture) updates.photoURL = picture;
      
      if (Object.keys(updates).length > 0) {
        user = await User.updateUser(user.id, updates);
      }
    }

    // Check if profile needs completion
    const needsProfile = !user.name || user.name === 'User' || !user.dateOfBirth;

    // Convert Firestore Timestamp to ISO string for response
    const userResponse = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      dateOfBirth: user.dateOfBirth ? (user.dateOfBirth.toDate ? user.dateOfBirth.toDate().toISOString() : user.dateOfBirth) : null,
      needsProfile
    };

    res.json({
      user: userResponse
    });
  } catch (error) {
    console.error('User verification error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Set user name (useful if older accounts have name="User")
router.post('/set-name', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const user = await User.getUserByFirebaseUid(uid);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUser = await User.updateUser(user.id, { name });

    const needsProfile = !updatedUser.name || updatedUser.name === 'User' || !updatedUser.dateOfBirth;
    const userResponse = {
      id: updatedUser.id,
      firebaseUid: updatedUser.firebaseUid,
      name: updatedUser.name,
      email: updatedUser.email,
      photoURL: updatedUser.photoURL,
      dateOfBirth: updatedUser.dateOfBirth ? (updatedUser.dateOfBirth.toDate ? updatedUser.dateOfBirth.toDate().toISOString() : updatedUser.dateOfBirth) : null,
      needsProfile
    };

    res.json({ user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const user = await User.getUserByFirebaseUid(uid);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const needsProfile = !user.name || user.name === 'User' || !user.dateOfBirth;

    const userResponse = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      dateOfBirth: user.dateOfBirth ? (user.dateOfBirth.toDate ? user.dateOfBirth.toDate().toISOString() : user.dateOfBirth) : null,
      needsProfile
    };

    res.json({
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Complete user profile (name and DOB)
router.post('/complete-profile', verifyFirebaseToken, async (req, res) => {
  try {
    const { name, dateOfBirth } = req.body;
    
    if (!name || !dateOfBirth) {
      return res.status(400).json({ message: 'Name and date of birth are required' });
    }

    const { uid } = req.user;
    const user = await User.getUserByFirebaseUid(uid);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUser = await User.updateUser(user.id, {
      name,
      dateOfBirth: admin.firestore.Timestamp.fromDate(new Date(dateOfBirth))
    });

    const userResponse = {
      id: updatedUser.id,
      firebaseUid: updatedUser.firebaseUid,
      name: updatedUser.name,
      email: updatedUser.email,
      photoURL: updatedUser.photoURL,
      dateOfBirth: updatedUser.dateOfBirth ? (updatedUser.dateOfBirth.toDate ? updatedUser.dateOfBirth.toDate().toISOString() : updatedUser.dateOfBirth) : null,
      needsProfile: false
    };

    res.json({
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
