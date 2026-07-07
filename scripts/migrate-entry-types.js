import { db } from '../firebase-admin.js';
import admin from '../firebase-admin.js';

const BATCH_LIMIT = 500;

const normalizeType = (entry) => {
  const rawType = entry?.type;
  if (rawType === 'income' || rawType === 'expense') return rawType;
  return 'expense';
};

const updateBatch = async (updates, label) => {
  if (updates.length === 0) return 0;

  const batch = db.batch();
  updates.forEach(({ ref, type }) => {
    batch.update(ref, {
      type,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log(`[migrate-entry-types] ${label}: updated ${updates.length} entries`);
  return updates.length;
};

const migrateUserEntries = async (userDoc) => {
  const userId = userDoc.id;
  let updatedCount = 0;

  const monthSnapshot = await db.collection('users').doc(userId).collection('months').get();
  const monthRefs = monthSnapshot.docs.map((doc) => doc.ref);

  for (const monthRef of monthRefs) {
    const entriesRef = monthRef.collection('entries');
    const snapshot = await entriesRef.get();
    const updates = [];
    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      if (data.type !== 'income' && data.type !== 'expense') {
        updates.push({ ref: doc.ref, type: normalizeType(data) });
      }
    });

    if (updates.length > 0) {
      updatedCount += await updateBatch(updates, `user ${userId} month ${monthRef.id}`);
    }
  }

  const legacySnapshot = await db.collection('budgetEntries').where('userId', '==', userId).get();
  const legacyUpdates = [];
  legacySnapshot.forEach((doc) => {
    const data = doc.data() || {};
    if (data.type === 'income' || data.type === 'expense') return;
    legacyUpdates.push({ ref: doc.ref, type: normalizeType(data) });
  });

  if (legacyUpdates.length > 0) {
    const chunked = [];
    for (let i = 0; i < legacyUpdates.length; i += BATCH_LIMIT) {
      chunked.push(legacyUpdates.slice(i, i + BATCH_LIMIT));
    }
    for (const chunk of chunked) {
      updatedCount += await updateBatch(chunk, `legacy entries for user ${userId}`);
    }
  }

  return updatedCount;
};

const main = async () => {
  try {
    const usersSnapshot = await db.collection('users').get();
    let totalUpdated = 0;
    for (const doc of usersSnapshot.docs) {
      const count = await migrateUserEntries(doc);
      totalUpdated += count;
    }
    console.log(`[migrate-entry-types] Completed. Updated ${totalUpdated} entries.`);
  } catch (error) {
    console.error('[migrate-entry-types] Failed:', error);
    process.exitCode = 1;
  }
};

main();
