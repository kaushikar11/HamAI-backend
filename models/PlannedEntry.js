// PlannedEntry model using Firestore
// Structure: users/{userId}/months/{year}-{month}/planned/{plannedId}
// Represents a "to be added" placeholder for a transaction the user knows is
// coming for a given month but hasn't finished/decided the details of yet.
import { db } from '../firebase-admin.js';
import admin from '../firebase-admin.js';

const getMonthPath = (month, year) => {
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();
  return `${y}-${String(m).padStart(2, '0')}`;
};

const getPlannedCollection = (userId, month, year) => {
  const monthPath = getMonthPath(month, year);
  return db.collection('users')
    .doc(userId)
    .collection('months')
    .doc(monthPath)
    .collection('planned');
};

export const createPlannedEntry = async (entryData) => {
  const { userId, description, amount, type, category, notes, month, year } = entryData;

  const entryMonth = month || new Date().getMonth() + 1;
  const entryYear = year || new Date().getFullYear();

  const entryDoc = {
    userId,
    description: description || '',
    amount: amount !== undefined && amount !== null && amount !== '' ? Number(amount) : null,
    type: type === 'income' ? 'income' : 'expense',
    category: category || '',
    notes: notes || '',
    month: entryMonth,
    year: entryYear,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const collectionRef = getPlannedCollection(userId, entryMonth, entryYear);
  const docRef = await collectionRef.add(entryDoc);

  return { id: docRef.id, ...entryDoc };
};

export const getPlannedEntriesByMonth = async (userId, month, year) => {
  const collectionRef = getPlannedCollection(userId, month, year);
  const snapshot = await collectionRef.get();
  const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  entries.sort((a, b) => {
    const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return bDate - aDate;
  });
  return entries;
};

export const updatePlannedEntry = async (entryId, userId, month, year, updates) => {
  const collectionRef = getPlannedCollection(userId, month, year);
  const docRef = collectionRef.doc(entryId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data().userId !== userId) return null;

  const updateData = { ...updates, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (updateData.amount !== undefined) {
    updateData.amount = updateData.amount !== null && updateData.amount !== '' ? Number(updateData.amount) : null;
  }
  await docRef.update(updateData);
  const updatedDoc = await docRef.get();
  return { id: updatedDoc.id, ...updatedDoc.data() };
};

export const deletePlannedEntry = async (entryId, userId, month, year) => {
  const collectionRef = getPlannedCollection(userId, month, year);
  const docRef = collectionRef.doc(entryId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data().userId !== userId) return false;
  await docRef.delete();
  return true;
};

export default {
  createPlannedEntry,
  getPlannedEntriesByMonth,
  updatePlannedEntry,
  deletePlannedEntry
};
