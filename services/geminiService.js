import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const categories = ['grocery', 'utility', 'restaurant', 'shopping', 'entertainment', 'transport', 'healthcare', 'education', 'other'];

const basicParseBudgetText = (text) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Try to extract items with amounts (amount at end of line).
  const items = [];
  for (const line of lines) {
    // Match: "<name> <amount>" where amount is a number (optionally $)
    const m = line.match(/^(.+?)\s+\$?\s*(-?\d+(?:\.\d{1,2})?)\s*$/);
    if (!m) continue;

    const name = m[1].trim();
    const amount = Number.parseFloat(m[2]);
    if (!name || Number.isNaN(amount)) continue;
    if (amount < 0) continue;

    items.push({ name, amount });
  }

  const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  // Very small heuristic: if we saw grocery-like words, pick grocery, else other.
  const joined = lines.join(' ').toLowerCase();
  const isGrocery =
    /\b(potato|potatoes|milk|bread|egg|eggs|banana|bananas|apple|apples|rice|vegetable|fruit|grocery)\b/.test(joined);

  return {
    store: 'Unknown Store',
    items,
    subtotal,
    tax: 0,
    category: isGrocery ? 'grocery' : 'other',
    notes: ''
  };
};

export const parseBudgetText = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a budget parsing assistant. Parse the following unformatted budget text and extract structured information.

Text: "${text}"

Extract and return a JSON object with the following structure:
{
  "store": "store or merchant name",
  "items": [
    {"name": "item name", "amount": number}
  ],
  "subtotal": number,
  "tax": number (default 0 if not mentioned),
  "category": "one of: ${categories.join(', ')}",
  "notes": "optional notes or context"
}

Rules:
- Extract all items with their amounts
- Calculate subtotal from items
- Extract tax if mentioned, otherwise 0
- Assign the most appropriate category based on store and items
- Add helpful notes if relevant (e.g., "shared with friends", "monthly subscription", etc.)
- Return ONLY valid JSON, no additional text

JSON:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text().trim();

    // Extract JSON from response (handle markdown code blocks if present)
    let jsonText = responseText;
    if (responseText.includes('```')) {
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
    }

    const parsed = JSON.parse(jsonText);

    // Validate and ensure all required fields
    const budgetData = {
      store: parsed.store || 'Unknown Store',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      subtotal: parsed.subtotal || parsed.items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0,
      tax: parsed.tax || 0,
      category: categories.includes(parsed.category?.toLowerCase()) ? parsed.category.toLowerCase() : 'other',
      notes: parsed.notes || ''
    };

    // Calculate total
    budgetData.total = budgetData.subtotal + budgetData.tax;

    // If Gemini returns nothing useful, fall back to basic parsing.
    if (!budgetData.items.length) {
      const fallback = basicParseBudgetText(text);
      fallback.total = fallback.subtotal + fallback.tax;
      return fallback;
    }

    return budgetData;
  } catch (error) {
    // Gemini can fail (model issues, quota, malformed JSON, etc). Fall back gracefully.
    console.error('Gemini API Error:', error);
    const fallback = basicParseBudgetText(text);
    fallback.total = fallback.subtotal + fallback.tax;
    if (fallback.items.length) return fallback;
    throw new Error('Failed to parse budget text. Please try again or enter manually.');
  }
};

export const categorizeBudget = async (store, items) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const itemsText = items.map(item => `${item.name}: $${item.amount}`).join(', ');
    
    const prompt = `Categorize this budget entry:
Store: ${store}
Items: ${itemsText}

Return ONLY one category from this list: ${categories.join(', ')}

Category:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const category = response.text().trim().toLowerCase();

    return categories.includes(category) ? category : 'other';
  } catch (error) {
    console.error('Gemini categorization error:', error);
    return 'other';
  }
};

export const generateNotes = async (store, items, category) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const itemsText = items.map(item => item.name).join(', ');
    
    const prompt = `Generate a brief, helpful note (max 50 words) for this budget entry. If it's shared with friends, mention it. If it's a subscription, mention it. Keep it concise and relevant.

Store: ${store}
Items: ${itemsText}
Category: ${category}

Note (or empty string if not needed):`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('Gemini notes generation error:', error);
    return '';
  }
};
