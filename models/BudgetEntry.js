// BudgetEntry model using Firestore
// New structure: users/{userId}/months/{year}-{month}/entries/{entryId}
import { db } from '../firebase-admin.js';
import admin from '../firebase-admin.js';

const COLLECTION_NAME = 'budgetEntries'; // Keep for backward compatibility during migration

// Helper function to get month path: "2025-08"
const getMonthPath = (month, year) => {
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();
  return `${y}-${String(m).padStart(2, '0')}`;
};

// Helper: tolerate legacy non-padded month docs (e.g. "2025-8")
const getMonthPathVariants = (month, year) => {
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();
  const mNum = typeof m === 'string' ? parseInt(m, 10) : m;
  const padded = `${y}-${String(mNum).padStart(2, '0')}`;
  const unpadded = `${y}-${String(mNum)}`;
  return padded === unpadded ? [padded] : [padded, unpadded];
};

// Helper function to get entry collection reference
const getEntriesCollection = (userId, month, year) => {
  const monthPath = getMonthPath(month, year);
  return db.collection('users')
    .doc(userId)
    .collection('months')
    .doc(monthPath)
    .collection('entries');
};

const getEntriesCollectionByMonthPath = (userId, monthPath) => {
  return db.collection('users')
    .doc(userId)
    .collection('months')
    .doc(monthPath)
    .collection('entries');
};

const toJsDate = (value) => {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value?.toDate === 'function') return value.toDate(); // Firestore Timestamp
  return new Date(0);
};

export const createEntry = async (entryData) => {
  const { userId, store, receiver, items, subtotal, tax, stateTax, federalTax, total, category, notes, month, year, type } = entryData;

  // Support both old 'store' and new 'receiver' field for backward compatibility
  const finalReceiver = receiver || store || 'Unknown';

  // Ensure month and year are set
  const entryMonth = month || new Date().getMonth() + 1;
  const entryYear = year || new Date().getFullYear();

  // Transaction type: 'income' (inflow) or 'expense' (outflow). Defaults to expense.
  const entryType = type === 'income' ? 'income' : 'expense';

  const entryDoc = {
    userId,
    store: finalReceiver, // Keep for backward compatibility
    receiver: finalReceiver,
    items,
    subtotal,
    tax: tax || 0,
    stateTax: stateTax || 0,
    federalTax: federalTax || 0,
    total,
    category: category || 'other',
    type: entryType,
    notes: notes || '',
    month: entryMonth,
    year: entryYear,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Use new structure: users/{userId}/months/{year}-{month}/entries/{entryId}
  // First, ensure the month document exists (Firestore requires parent documents to exist)
  const monthPath = getMonthPath(entryMonth, entryYear);
  const monthRef = db.collection('users')
    .doc(userId)
    .collection('months')
    .doc(monthPath);
  
  // Check if month document exists, if not create it
  const monthDoc = await monthRef.get();
  if (!monthDoc.exists) {
    await monthRef.set({
      month: entryMonth,
      year: entryYear,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[createEntry] Created month document ${monthPath} for user ${userId}`);
  }
  
  const entriesRef = getEntriesCollection(userId, entryMonth, entryYear);
  const docRef = await entriesRef.add(entryDoc);
  
  console.log(`[createEntry] Created entry ${docRef.id} in users/${userId}/months/${monthPath}/entries/`);
  
  return { id: docRef.id, ...entryDoc };
};

export const getEntryById = async (entryId, userId, month, year) => {
  // Try new structure first
  if (month && year) {
    const entriesRef = getEntriesCollection(userId, month, year);
    const doc = await entriesRef.doc(entryId).get();
    
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
  }
  
  // Fallback: search across all months for this user
  // This is less efficient but handles cases where month/year not provided
  const userRef = db.collection('users').doc(userId);
  const monthsSnapshot = await userRef.collection('months').get();
  
  for (const monthDoc of monthsSnapshot.docs) {
    const entriesRef = monthDoc.ref.collection('entries');
    const entryDoc = await entriesRef.doc(entryId).get();
    
    if (entryDoc.exists) {
      const data = entryDoc.data();
      if (data.userId === userId) {
        return { id: entryDoc.id, ...data };
      }
    }
  }
  
  // Also check old structure for backward compatibility
  const oldDoc = await db.collection(COLLECTION_NAME).doc(entryId).get();
  if (oldDoc.exists) {
    const data = oldDoc.data();
    if (data.userId === userId) {
      return { id: oldDoc.id, ...data };
    }
  }
  
  return null;
};

export const getEntriesByUser = async (userId, options = {}) => {
  const { page = 1, limit = 20, category, month, year, lastDoc } = options;

  let entries = [];
  let total = 0;

  // If month and year are specified, use new structure (much more efficient)
  if (month !== undefined && month !== null && year !== undefined && year !== null) {
    try {
      const monthPaths = getMonthPathVariants(month, year);
      console.log(`[getEntriesByUser] Querying entries for user ${userId}, month ${month}, year ${year}, month paths: ${monthPaths.join(', ')}`);
      
      // First, check if the user document exists
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        console.log(`[getEntriesByUser] User document ${userId} does not exist`);
        return {
          entries: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0,
            lastDoc: null
          }
        };
      }
      console.log(`[getEntriesByUser] User document ${userId} exists`);
      
      // Query all month path variants and merge results (handles legacy "YYYY-M" docs)
      const allEntries = [];
      for (const monthPath of monthPaths) {
        const entriesRef = getEntriesCollectionByMonthPath(userId, monthPath);
        console.log(`[getEntriesByUser] Querying entries collection: users/${userId}/months/${monthPath}/entries`);

        let query = entriesRef;
        if (category && category !== 'all' && category !== '') {
          query = query.where('category', '==', category);
        }

        const snapshot = await query.get();
        console.log(`[getEntriesByUser] Found ${snapshot.size} entries in ${monthPath}`);
        snapshot.docs.forEach(doc => {
          allEntries.push({ id: doc.id, ...doc.data() });
        });
      }

      // De-dupe (just in case)
      const byId = new Map();
      allEntries.forEach(e => byId.set(e.id, e));
      const merged = Array.from(byId.values());

      merged.sort((a, b) => {
        const aDate = toJsDate(a.createdAt) || toJsDate(a.date);
        const bDate = toJsDate(b.createdAt) || toJsDate(b.date);
        return bDate - aDate;
      });

      total = merged.length;
      const startIndex = (page - 1) * limit;
      entries = merged.slice(startIndex, startIndex + limit);

      console.log(`[getEntriesByUser] Returning ${entries.length} entries after pagination (total ${total})`);
    } catch (error) {
      console.error(`[getEntriesByUser] Error querying new structure for month ${month}, year ${year}:`, error.message);
      console.error(`[getEntriesByUser] Full error:`, error);
      // If query fails due to missing index, try without orderBy
      try {
        const entriesRef = getEntriesCollection(userId, month, year);
        let query = entriesRef;
        
        if (category && category !== 'all' && category !== '') {
          query = query.where('category', '==', category);
        }
        
        const snapshot = await query.get();
        entries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort manually by date
        entries.sort((a, b) => {
          const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
          const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
          return dateB - dateA;
        });
        
        total = entries.length;
        
        // Apply pagination manually
        const startIndex = (page - 1) * limit;
        entries = entries.slice(startIndex, startIndex + limit);
        
        console.log(`Fallback query returned ${entries.length} entries`);
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        return {
          entries: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0,
            lastDoc: null
          }
        };
      }
    }
  } else {
    // If no month/year specified, search across all months
    const userRef = db.collection('users').doc(userId);
    const monthsSnapshot = await userRef.collection('months').get();
    
    const allEntries = [];
    
    for (const monthDoc of monthsSnapshot.docs) {
      const entriesRef = monthDoc.ref.collection('entries');
      let query = entriesRef;

      // Filter by category if provided
      if (category && category !== 'all' && category !== '') {
        query = query.where('category', '==', category);
      }

      const snapshot = await query.get();
      snapshot.docs.forEach(doc => {
        allEntries.push({ id: doc.id, ...doc.data() });
      });
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bb92b76a-412d-47b7-a39d-c25ffcf90250', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'H1',
        location: 'models/BudgetEntry.js:getEntriesByUser:noMonthYear',
        message: 'Collected entries across all months for user',
        data: {
          userId,
          monthsCount: monthsSnapshot.size,
          allEntriesCount: allEntries.length,
          sample: allEntries.slice(0, 3).map(e => ({
            id: e.id,
            month: e.month,
            year: e.year,
            total: e.total,
            category: e.category
          }))
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion agent log

    // Sort all entries by createdAt/date descending (in-memory, tolerant of missing fields)
    allEntries.sort((a, b) => {
      const dateA =
        a.createdAt?.toDate?.() ??
        (a.createdAt instanceof Date ? a.createdAt : a.date?.toDate?.() ?? new Date(a.date || 0));
      const dateB =
        b.createdAt?.toDate?.() ??
        (b.createdAt instanceof Date ? b.createdAt : b.date?.toDate?.() ?? new Date(b.date || 0));
      return dateB - dateA;
    });
    
    total = allEntries.length;
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    entries = allEntries.slice(startIndex, startIndex + limit);
  }

  // Also check old structure for backward compatibility (only if no results found)
  if (entries.length === 0) {
    let query = db.collection(COLLECTION_NAME)
      .where('userId', '==', userId);

    if (month !== undefined && month !== null) {
      query = query.where('month', '==', parseInt(month));
    }
    
    if (year !== undefined && year !== null) {
      query = query.where('year', '==', parseInt(year));
    }

    if (category && category !== 'all' && category !== '') {
      query = query.where('category', '==', category);
    }

    try {
      const snapshot = await query.get();
      entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort in-memory similar to above
      entries.sort((a, b) => {
        const dateA =
          a.createdAt?.toDate?.() ??
          (a.createdAt instanceof Date ? a.createdAt : a.date?.toDate?.() ?? new Date(a.date || 0));
        const dateB =
          b.createdAt?.toDate?.() ??
          (b.createdAt instanceof Date ? b.createdAt : b.date?.toDate?.() ?? new Date(b.date || 0));
        return dateB - dateA;
      });
      total = entries.length;
    } catch (error) {
      console.warn('Error querying old structure:', error.message);
    }
  }

  return {
    entries,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      lastDoc: entries.length > 0 ? entries[entries.length - 1] : null
    }
  };
};

export const updateEntry = async (entryId, userId, updates) => {
  // Try to find entry in new structure first
  let entryMonth = updates.month || null;
  let entryYear = updates.year || null;
  
  let entry = null;
  if (entryMonth && entryYear) {
    entry = await getEntryById(entryId, userId, entryMonth, entryYear);
  } else {
    // Search across all months
    const userRef = db.collection('users').doc(userId);
    const monthsSnapshot = await userRef.collection('months').get();
    
    for (const monthDoc of monthsSnapshot.docs) {
      const entriesRef = monthDoc.ref.collection('entries');
      const entryDoc = await entriesRef.doc(entryId).get();
      
      if (entryDoc.exists) {
        entry = { id: entryDoc.id, ...entryDoc.data() };
        entryMonth = entry.month;
        entryYear = entry.year;
        break;
      }
    }
  }
  
  // Fallback to old structure
  if (!entry) {
    const oldDoc = await db.collection(COLLECTION_NAME).doc(entryId).get();
    if (oldDoc.exists) {
      entry = { id: oldDoc.id, ...oldDoc.data() };
      entryMonth = entry.month;
      entryYear = entry.year;
    }
  }
  
  if (!entry) {
    return null;
  }

  const updateData = {
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Recalculate total if subtotal or tax changed
  if (updates.subtotal !== undefined || updates.tax !== undefined) {
    const subtotal = updates.subtotal !== undefined ? updates.subtotal : entry.subtotal;
    const tax = updates.tax !== undefined ? updates.tax : entry.tax;
    const effectiveType = updates.type !== undefined ? updates.type : entry.type;
    updateData.total = effectiveType === 'income' ? subtotal - tax : subtotal + tax;
  }

  // If month/year changed, we need to move the entry to the new location
  const newMonth = updates.month !== undefined ? updates.month : entryMonth;
  const newYear = updates.year !== undefined ? updates.year : entryYear;
  
  // Update in new structure
  if (entryMonth && entryYear) {
    // If month/year changed, delete from old location and create in new
    if ((updates.month !== undefined && updates.month !== entryMonth) || 
        (updates.year !== undefined && updates.year !== entryYear)) {
      // Delete from old location
      const oldEntriesRef = getEntriesCollection(userId, entryMonth, entryYear);
      await oldEntriesRef.doc(entryId).delete();
      
      // Create in new location
      const newEntriesRef = getEntriesCollection(userId, newMonth, newYear);
      await newEntriesRef.doc(entryId).set(updateData);
    } else {
      // Just update in place
      const entriesRef = getEntriesCollection(userId, entryMonth, entryYear);
      await entriesRef.doc(entryId).update(updateData);
    }
    return getEntryById(entryId, userId, newMonth, newYear);
  }
  
  // Fallback to old structure
  await db.collection(COLLECTION_NAME).doc(entryId).update(updateData);
  return getEntryById(entryId, userId, entryMonth, entryYear);
};

export const deleteEntry = async (entryId, userId, month, year) => {
  // Try new structure first
  if (month && year) {
    const entriesRef = getEntriesCollection(userId, month, year);
    const entryDoc = await entriesRef.doc(entryId).get();
    
    if (entryDoc.exists) {
      await entriesRef.doc(entryId).delete();
      return true;
    }
  }
  
  // Search across all months
  const userRef = db.collection('users').doc(userId);
  const monthsSnapshot = await userRef.collection('months').get();
  
  for (const monthDoc of monthsSnapshot.docs) {
    const entriesRef = monthDoc.ref.collection('entries');
    const entryDoc = await entriesRef.doc(entryId).get();
    
    if (entryDoc.exists) {
      await entriesRef.doc(entryId).delete();
      return true;
    }
  }
  
  // Fallback to old structure
  const oldDoc = await db.collection(COLLECTION_NAME).doc(entryId).get();
  if (oldDoc.exists) {
    const data = oldDoc.data();
    if (data.userId === userId) {
      await db.collection(COLLECTION_NAME).doc(entryId).delete();
      return true;
    }
  }
  
  return false;
};

export default {
  createEntry,
  getEntryById,
  getEntriesByUser,
  updateEntry,
  deleteEntry
};
