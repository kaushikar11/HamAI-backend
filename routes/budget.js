import express from 'express';
import { body, validationResult } from 'express-validator';
import verifyToken from '../middleware/auth.js';
import * as BudgetEntry from '../models/BudgetEntry.js';
import * as User from '../models/User.js';
import * as UserPreferences from '../models/UserPreferences.js';
import { parseBudgetText, categorizeBudget, generateNotes } from '../services/geminiService.js';
import { sanitizeInput, sanitizeItems } from '../utils/sanitize.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Middleware to get user from Firebase UID
const getUserFromToken = async (req, res, next) => {
  try {
    const user = await User.getUserByFirebaseUid(req.user.uid);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    req.userId = user.id; // Use Firestore document ID
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

router.use(getUserFromToken);

// IMPORTANT: Define specific routes BEFORE the /:id route to avoid route conflicts
// Get all categories for a user
router.get('/categories', async (req, res) => {
  try {
    const prefs = await UserPreferences.getUserPreferences(req.userId);
    res.json({ categories: prefs.categories || [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add category for a user
router.post('/categories', async (req, res) => {
  try {
    const { category } = req.body;
    if (!category || !category.trim()) {
      return res.status(400).json({ message: 'Category is required' });
    }
    
    const categories = await UserPreferences.addCategory(req.userId, category.trim());
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all receivers for a user
router.get('/receivers', async (req, res) => {
  try {
    const prefs = await UserPreferences.getUserPreferences(req.userId);
    res.json({ receivers: prefs.receiverNames || [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add receiver name for a user
router.post('/receivers', async (req, res) => {
  try {
    const { receiver } = req.body;
    if (!receiver || !receiver.trim()) {
      return res.status(400).json({ message: 'Receiver name is required' });
    }
    
    const receivers = await UserPreferences.addReceiverName(req.userId, receiver.trim());
    res.json({ receivers });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get statistics for a month/year
router.get('/stats/summary', async (req, res) => {
  try {
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;

    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    console.log(`Fetching entries for user ${req.userId}, month ${month}, year ${year}`);

    const result = await BudgetEntry.getEntriesByUser(req.userId, {
      page: 1,
      limit: 10000, // Get all entries for the month
      month,
      year
    });

    console.log(`Query returned ${result.entries.length} entries`);
    if (result.entries.length > 0) {
      console.log(`First entry ID: ${result.entries[0].id}, receiver: ${result.entries[0].receiver}`);
    }

    const entries = result.entries || [];
    console.log(`Found ${entries.length} entries for month ${month}, year ${year}`);
    
    // Calculate statistics
    const totalSpent = entries.reduce((sum, entry) => sum + (entry.total || 0), 0);
    const totalEntries = entries.length;
    
    // Group by category
    const categoryTotals = {};
    entries.forEach(entry => {
      const cat = entry.category || 'other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (entry.total || 0);
    });

    // Get all unique categories
    const categories = [...new Set(entries.map(e => e.category || 'other'))];

    res.json({
      month,
      year,
      totalSpent,
      totalEntries,
      categoryTotals,
      categories,
      entries: entries.map(entry => {
        const { date, ...entryWithoutDate } = entry;
        return {
          ...entryWithoutDate,
          createdAt: entry.createdAt?.toDate ? entry.createdAt.toDate().toISOString() : entry.createdAt,
          updatedAt: entry.updatedAt?.toDate ? entry.updatedAt.toDate().toISOString() : entry.updatedAt,
          _id: entry.id
        };
      })
    });
  } catch (error) {
    console.error('Error in stats/summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Parse unformatted text using AI
router.post('/parse', [
  body('text').notEmpty().withMessage('Text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { text } = req.body;
    const parsedData = await parseBudgetText(text);

    res.json(parsedData);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to parse text' });
  }
});

// Auto-categorize and generate notes for manual entry
router.post('/enhance', [
  body('store').notEmpty().withMessage('Store is required'),
  body('items').isArray().withMessage('Items must be an array'),
  body('items.*.name').notEmpty().withMessage('Item name is required'),
  body('items.*.amount').isNumeric().withMessage('Item amount must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { store, items } = req.body;

    // Auto-categorize
    const category = await categorizeBudget(store, items);

    // Generate notes
    const notes = await generateNotes(store, items, category);

    res.json({ category, notes });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to enhance entry' });
  }
});

// Get all budget entries with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;

    const result = await BudgetEntry.getEntriesByUser(req.userId, {
      page,
      limit,
      category,
      month,
      year
    });

    // Convert Firestore Timestamps to ISO strings (don't include date field)
    const entries = result.entries.map(entry => {
      const { date, ...entryWithoutDate } = entry;
      return {
        ...entryWithoutDate,
        createdAt: entry.createdAt?.toDate ? entry.createdAt.toDate().toISOString() : entry.createdAt,
        updatedAt: entry.updatedAt?.toDate ? entry.updatedAt.toDate().toISOString() : entry.updatedAt,
        _id: entry.id // Keep _id for compatibility
      };
    });

    res.json({
      entries,
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single budget entry
router.get('/:id', async (req, res) => {
  try {
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;
    const entry = await BudgetEntry.getEntryById(req.params.id, req.userId, month, year);
    
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    // Convert Firestore Timestamps to ISO strings (don't include date field)
    const { date, ...entryWithoutDate } = entry;
    const entryResponse = {
      ...entryWithoutDate,
      createdAt: entry.createdAt?.toDate ? entry.createdAt.toDate().toISOString() : entry.createdAt,
      updatedAt: entry.updatedAt?.toDate ? entry.updatedAt.toDate().toISOString() : entry.updatedAt,
      _id: entry.id // Keep _id for compatibility
    };

    res.json(entryResponse);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create budget entry
router.post('/', [
  body('receiver').optional().notEmpty().withMessage('Receiver cannot be empty'),
  body('store').optional().notEmpty().withMessage('Store cannot be empty'), // Backward compatibility
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.name').notEmpty().withMessage('Item name is required'),
  body('items.*.amount').isNumeric().withMessage('Item amount must be a number'),
  body('subtotal').isNumeric().withMessage('Subtotal must be a number'),
  body('tax').optional().isNumeric().withMessage('Tax must be a number'),
  body('category').notEmpty().withMessage('Category is required'),
  body('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  body('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Year must be valid')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { store, receiver, items, subtotal, tax = 0, category, notes = '', month, year } = req.body;
    
    // Validate that either receiver or store is provided
    if (!receiver && !store) {
      return res.status(400).json({ errors: [{ msg: 'Receiver or Store is required' }] });
    }

    // Sanitize inputs
    const finalReceiver = receiver || store;
    const sanitizedReceiver = sanitizeInput(finalReceiver);
    const sanitizedItems = sanitizeItems(items);
    const sanitizedNotes = sanitizeInput(notes);

    const total = subtotal + tax;

    const entry = await BudgetEntry.createEntry({
      userId: req.userId,
      receiver: sanitizedReceiver,
      store: sanitizedReceiver, // Keep for backward compatibility
      items: sanitizedItems,
      subtotal,
      tax,
      total,
      category: sanitizeInput(category),
      notes: sanitizedNotes,
      month: month || new Date().getMonth() + 1,
      year: year || new Date().getFullYear()
    });

    // Convert Firestore Timestamp to ISO string
    const entryResponse = {
      ...entry,
      date: entry.date?.toDate ? entry.date.toDate().toISOString() : entry.date,
      createdAt: entry.createdAt?.toDate ? entry.createdAt.toDate().toISOString() : entry.createdAt,
      updatedAt: entry.updatedAt?.toDate ? entry.updatedAt.toDate().toISOString() : entry.updatedAt,
      _id: entry.id // Keep _id for compatibility
    };

    res.status(201).json(entryResponse);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update budget entry
router.put('/:id', [
  body('store').optional().notEmpty().withMessage('Store cannot be empty'),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
  body('subtotal').optional().isNumeric().withMessage('Subtotal must be a number'),
  body('tax').optional().isNumeric().withMessage('Tax must be a number'),
  body('category').optional().isIn(['grocery', 'utility', 'restaurant', 'shopping', 'entertainment', 'transport', 'healthcare', 'education', 'other']).withMessage('Invalid category')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updates = {};
    
    // Sanitize and update fields
    if (req.body.receiver) {
      updates.receiver = sanitizeInput(req.body.receiver);
      updates.store = sanitizeInput(req.body.receiver); // Keep for backward compatibility
    }
    if (req.body.store && !req.body.receiver) {
      updates.receiver = sanitizeInput(req.body.store);
      updates.store = sanitizeInput(req.body.store);
    }
    if (req.body.items) updates.items = sanitizeItems(req.body.items);
    if (req.body.subtotal !== undefined) updates.subtotal = req.body.subtotal;
    if (req.body.tax !== undefined) updates.tax = req.body.tax;
    if (req.body.category) updates.category = sanitizeInput(req.body.category);
    if (req.body.notes !== undefined) updates.notes = sanitizeInput(req.body.notes);
    if (req.body.month !== undefined) updates.month = parseInt(req.body.month);
    if (req.body.year !== undefined) updates.year = parseInt(req.body.year);

    const entry = await BudgetEntry.updateEntry(req.params.id, req.userId, updates);
    
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    // Convert Firestore Timestamp to ISO string
    const entryResponse = {
      ...entry,
      date: entry.date?.toDate ? entry.date.toDate().toISOString() : entry.date,
      createdAt: entry.createdAt?.toDate ? entry.createdAt.toDate().toISOString() : entry.createdAt,
      updatedAt: entry.updatedAt?.toDate ? entry.updatedAt.toDate().toISOString() : entry.updatedAt,
      _id: entry.id // Keep _id for compatibility
    };

    res.json(entryResponse);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete budget entry
router.delete('/:id', async (req, res) => {
  try {
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;
    const deleted = await BudgetEntry.deleteEntry(req.params.id, req.userId, month, year);
    
    if (!deleted) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


export default router;
