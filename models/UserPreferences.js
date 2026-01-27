import { db } from '../firebase-admin.js';

/**
 * Get or create user preferences document
 * Stored at: users/{userId}/preferences (near entries document as requested)
 */
export const getUserPreferences = async (userId) => {
  const docRef = db.collection('users').doc(userId).collection('preferences').doc('settings');
  const doc = await docRef.get();
  
  if (doc.exists) {
    return doc.data();
  }
  
  // Create default preferences with default categories and receivers
  const defaultPreferences = {
    receiverNames: ['personal', 'store', 'supermarket', 'online', 'restaurant', 'gas station', 'pharmacy', 'other'],
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other'],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  await docRef.set(defaultPreferences);
  return defaultPreferences;
};

/**
 * Update receiver names for a user
 */
export const updateReceiverNames = async (userId, receiverNames) => {
  const docRef = db.collection('users').doc(userId).collection('preferences').doc('settings');
  await docRef.set({
    receiverNames,
    updatedAt: new Date()
  }, { merge: true });
  return receiverNames;
};

/**
 * Add receiver name for a user
 */
export const addReceiverName = async (userId, receiverName) => {
  const prefs = await getUserPreferences(userId);
  const names = prefs.receiverNames || [];
  
  // Case-sensitive check and add
  if (!names.includes(receiverName)) {
    names.push(receiverName);
    await updateReceiverNames(userId, names);
  }
  
  return names;
};

/**
 * Update categories for a user
 */
export const updateCategories = async (userId, categories) => {
  const docRef = db.collection('users').doc(userId).collection('preferences').doc('settings');
  await docRef.set({
    categories,
    updatedAt: new Date()
  }, { merge: true });
  return categories;
};

/**
 * Add category for a user
 */
export const addCategory = async (userId, category) => {
  const prefs = await getUserPreferences(userId);
  const cats = prefs.categories || [];
  
  // Case-sensitive check and add
  if (!cats.includes(category)) {
    cats.push(category);
    await updateCategories(userId, cats);
  }
  
  return cats;
};
