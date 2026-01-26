// User model using Firestore
import { db } from '../firebase-admin.js';
import admin from '../firebase-admin.js';

const COLLECTION_NAME = 'users';

export const createUser = async (userData) => {
  const { firebaseUid, name, email, photoURL, dateOfBirth } = userData;
  
  const userDoc = {
    firebaseUid,
    name,
    email: email.toLowerCase(),
    photoURL: photoURL || null,
    dateOfBirth: dateOfBirth ? admin.firestore.Timestamp.fromDate(new Date(dateOfBirth)) : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const docRef = await db.collection(COLLECTION_NAME).add(userDoc);
  return { id: docRef.id, ...userDoc };
};

export const getUserByFirebaseUid = async (firebaseUid) => {
  const snapshot = await db.collection(COLLECTION_NAME)
    .where('firebaseUid', '==', firebaseUid)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};

export const getUserByEmail = async (email) => {
  const snapshot = await db.collection(COLLECTION_NAME)
    .where('email', '==', email.toLowerCase())
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};

export const getUserById = async (userId) => {
  const doc = await db.collection(COLLECTION_NAME).doc(userId).get();
  
  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
};

export const updateUser = async (userId, updates) => {
  const updateData = {
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection(COLLECTION_NAME).doc(userId).update(updateData);
  return getUserById(userId);
};

export default {
  createUser,
  getUserByFirebaseUid,
  getUserByEmail,
  getUserById,
  updateUser
};
