import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ensure .env is loaded (in case service is imported before server.js loads it)
if (!process.env.GEMINI_API_KEY) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  dotenv.config({ path: join(__dirname, '..', '.env') });
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Default categories (fallback if user categories not provided)
const defaultCategories = ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other'];

const basicParseBudgetText = (text, userCategories = defaultCategories) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let store = 'Unknown Store';
  let tax = 0;
  const items = [];
  
  // First pass: identify store, tax, subtotal, total
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Check for store name (usually first line that doesn't have a price pattern)
    if (!store || store === 'Unknown Store') {
      // If line doesn't match price pattern and isn't a keyword, it might be store name
      if (!line.match(/\$?\s*\d+(?:\.\d{1,2})?\s*$/) && 
          !lowerLine.includes('subtotal') && 
          !lowerLine.includes('total') && 
          !lowerLine.includes('tax') &&
          !lowerLine.includes('item')) {
        store = line;
      }
    }
    
    // Extract tax
    if (lowerLine.includes('tax')) {
      const taxMatch = line.match(/\$?\s*(\d+(?:\.\d{1,2})?)\s*$/);
      if (taxMatch) {
        tax = Number.parseFloat(taxMatch[1]);
        continue; // Skip tax line, don't add as item
      }
    }
  }
  
  // Second pass: extract items (skip tax, subtotal, total lines)
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Skip tax, subtotal, total lines
    if (lowerLine.includes('tax') || lowerLine.includes('subtotal') || lowerLine.includes('total')) {
      continue;
    }
    
    // Skip lines that are clearly store names or headers
    if (lowerLine.includes('bought') || lowerLine.includes('today') || lowerLine.includes('receipt')) {
      continue;
    }
    
    // Match: "<name> <amount>" where amount is a number (optionally $)
    // Also handle formats like "Item: $amount" or "Item $amount"
    const patterns = [
      /^(.+?)\s+\$?\s*(-?\d+(?:\.\d{1,2})?)\s*$/,  // "name amount"
      /^(.+?):\s*\$?\s*(-?\d+(?:\.\d{1,2})?)\s*$/,  // "name: amount"
      /^(.+?)\s+\$(-?\d+(?:\.\d{1,2})?)\s*$/        // "name $amount"
    ];
    
    let matched = false;
    for (const pattern of patterns) {
      const m = line.match(pattern);
      if (m) {
        const name = m[1].trim();
        const amount = Number.parseFloat(m[2]);
        if (name && !Number.isNaN(amount) && amount >= 0) {
          items.push({ name, amount });
          matched = true;
          break;
        }
      }
    }
    
    // If no price pattern matched but line looks like an item name (not a header/keyword)
    // Extract as item with 0 amount (user can fill in later)
    if (!matched && line.trim().length > 0 && 
        !lowerLine.includes('store') && 
        !lowerLine.includes('payment') &&
        !lowerLine.includes('company') &&
        line.trim().length < 50) { // Reasonable item name length
      const cleanName = line.trim();
      // Only add if it looks like an item (not a number, not a date, etc.)
      if (!/^\d+$/.test(cleanName) && !/^\d{1,2}[\/\-]\d{1,2}/.test(cleanName)) {
        items.push({ name: cleanName, amount: 0 });
      }
    }
  }

  const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  // Category detection heuristics
  const joined = lines.join(' ').toLowerCase();
  let detectedCategory = 'other';
  
  if (/\b(potato|potatoes|milk|bread|egg|eggs|banana|bananas|apple|apples|rice|vegetable|fruit|grocery|walmart|supermarket|store)\b/.test(joined)) {
    detectedCategory = 'grocery';
  } else if (/\b(restaurant|pizza|pasta|food|dine|eat|meal)\b/.test(joined)) {
    detectedCategory = 'restaurant';
  } else if (/\b(transport|uber|taxi|bus|train|gas|fuel)\b/.test(joined)) {
    detectedCategory = 'transport';
  } else if (/\b(electric|utility|utilities|water|gas|bill)\b/.test(joined)) {
    detectedCategory = 'utilities';
  } else if (/\b(rent|apartment|housing)\b/.test(joined)) {
    detectedCategory = 'rent';
  } else if (/\b(shop|mall|clothing|clothes|shirt|jeans|shoes)\b/.test(joined)) {
    detectedCategory = 'shopping';
  } else if (/\b(healthcare|pharmacy|prescription|medicine|doctor|hospital|cvs)\b/.test(joined)) {
    detectedCategory = 'healthcare';
  } else if (/\b(subscription|netflix|spotify|monthly)\b/.test(joined)) {
    detectedCategory = 'subscription';
  }

  // Use detected category if it exists in user categories, otherwise use fallback
  const defaultCategory = userCategories && userCategories.length > 0 
    ? (userCategories.includes(detectedCategory) ? detectedCategory : (userCategories.includes('other') ? 'other' : userCategories[userCategories.length - 1]))
    : detectedCategory;

  return {
    store,
    items,
    subtotal,
    tax,
    category: defaultCategory,
    notes: ''
  };
};

const defaultIncomeCategories = ['deposit', 'refund', 'salary'];
const defaultIncomeSenders = ['Kaushik', 'Parents', 'Uncle', 'NYU'];

export const parseBudgetText = async (text, userCategories = null, type = 'expense', userReceivers = []) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const isIncome = type === 'income';

    // Use user categories if provided, otherwise use defaults
    const baseCategories = userCategories && userCategories.length > 0
      ? userCategories
      : defaultCategories;

    // For income, prepend income-specific categories so they rank first
    const categories = isIncome
      ? [...new Set([...defaultIncomeCategories, ...baseCategories])]
      : baseCategories;

    // Build sender suggestions for income
    const senderList = isIncome
      ? [...new Set([...defaultIncomeSenders, ...userReceivers])].join(', ')
      : '';

    const prompt = isIncome
      ? `You are a budget parsing assistant. Parse the following income/payment text and extract structured information.

Text: "${text}"

Available categories for this user: ${categories.join(', ')}
Known senders/payers: ${senderList}

Extract and return a JSON object with the following structure:
{
  "store": "sender or payer name (the person/org paying you)",
  "items": [
    {"name": "income description", "amount": number}
  ],
  "subtotal": number,
  "stateTax": number (state tax deducted, default 0 if not mentioned),
  "federalTax": number (federal tax deducted, default 0 if not mentioned),
  "tax": number (total tax = stateTax + federalTax, default 0),
  "category": "one of: ${categories.join(', ')}",
  "notes": "optional notes or context"
}

Rules:
- "store" is the SENDER (who paid you), not a store
- Extract all income line items with their amounts
- If state tax and/or federal tax are mentioned, extract them separately; set "tax" = stateTax + federalTax
- Assign the most appropriate income category (deposit, salary, refund are preferred if applicable)
- Return ONLY valid JSON, no additional text or markdown

JSON:`
      : `You are a budget parsing assistant. Parse the following unformatted budget text and extract structured information.

Text: "${text}"

Available categories for this user: ${categories.join(', ')}

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
- Extract ALL individual items with their respective prices/amounts from the text
- Calculate subtotal from the sum of all items
- Extract tax if mentioned, otherwise 0
- Assign the most appropriate category from the provided list based on store and items
- If the items don't clearly match any existing category, use the category that seems closest, or use "other" if truly unmatched
- Add helpful notes if relevant (e.g., "shared with friends", "monthly subscription", etc.)
- Return ONLY valid JSON, no additional text or markdown

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

    // Try to extract JSON if it's embedded in text
    if (!jsonText.startsWith('{')) {
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
    }

    const parsed = JSON.parse(jsonText);

    // Validate and ensure all required fields
    const stateTax = parsed.stateTax || 0;
    const federalTax = parsed.federalTax || 0;
    const combinedTax = isIncome ? stateTax + federalTax : (parsed.tax || 0);
    const subtotal = parsed.subtotal || parsed.items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
    const budgetData = {
      store: parsed.store || (isIncome ? 'Unknown Sender' : 'Unknown Store'),
      items: Array.isArray(parsed.items) ? parsed.items : [],
      subtotal,
      tax: combinedTax,
      stateTax,
      federalTax,
      category: categories.includes(parsed.category?.toLowerCase()) ? parsed.category.toLowerCase() : (categories.includes('other') ? 'other' : categories[0]),
      notes: parsed.notes || ''
    };

    // Calculate total (income deducts tax, expense adds it)
    budgetData.total = isIncome ? budgetData.subtotal - budgetData.tax : budgetData.subtotal + budgetData.tax;

    // If Gemini returns nothing useful, fall back to basic parsing.
    if (!budgetData.items.length) {
      const fallback = basicParseBudgetText(text, categories);
      fallback.stateTax = 0;
      fallback.federalTax = 0;
      fallback.total = isIncome ? fallback.subtotal - fallback.tax : fallback.subtotal + fallback.tax;
      return fallback;
    }

    return budgetData;
  } catch (error) {
    // Gemini can fail (model issues, quota, malformed JSON, etc). Fall back gracefully.
    console.error('Gemini API Error:', error);
    console.error('Error details:', error.message);
    const isIncomeFallback = type === 'income';
    const fallbackCats = userCategories && userCategories.length > 0 ? userCategories : defaultCategories;
    const fallback = basicParseBudgetText(text, fallbackCats);
    fallback.stateTax = 0;
    fallback.federalTax = 0;
    fallback.total = isIncomeFallback ? fallback.subtotal - fallback.tax : fallback.subtotal + fallback.tax;
    if (fallback.items.length > 0) return fallback;
    throw new Error('Failed to parse budget text. Please try again or enter manually.');
  }
};

export const categorizeBudget = async (store, items, userCategories = null) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const categories = userCategories && userCategories.length > 0 
      ? userCategories 
      : defaultCategories;

    const itemsText = items.map(item => `${item.name}: $${item.amount}`).join(', ');
    
    const prompt = `Categorize this budget entry:
Store: ${store}
Items: ${itemsText}

Return ONLY one category from this list: ${categories.join(', ')}

Category:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const category = response.text().trim().toLowerCase();

    return categories.includes(category) ? category : (categories.includes('other') ? 'other' : categories[0]);
  } catch (error) {
    console.error('Gemini categorization error:', error);
    const categories = userCategories && userCategories.length > 0 ? userCategories : defaultCategories;
    return categories.includes('other') ? 'other' : categories[0];
  }
};

/**
 * Answer user questions about their own financial data.
 * This powers the Mr.Ham chatbot and MUST ONLY use the provided data.
 *
 * @param {string} question - The user's natural language question.
 * @param {object} budgetContext - Aggregated data about the user's finances:
 *   {
 *     summary: { overallTotal, overallCount, earliestYear, latestYear, totalTax, averagePerTransaction },
 *     byCategory: { [category]: { total, count } },
 *     byMonth: { [yearMonth]: { total, count } },
 *     categories: string[],
 *     receivers: string[]
 *   }
 */
export const answerBudgetQuestion = async (question, budgetContext) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Keep the payload compact: only send aggregates and preferences, not every raw entry
    const safeContext = { ...budgetContext };

    const contextJson = JSON.stringify(safeContext, null, 2);

    const prompt = `
You are **Mr. Ham**, a friendly pig-themed personal finance assistant for a single user.
Your greetings can be playful, but when you explain numbers or insights you should be clear and analytical first, and only add at most one short, subtle pig-related phrase at the end if it does not reduce clarity.

You are given this user's historical budgeting data as JSON. You must follow these rules strictly:

- ONLY use the data provided in the JSON context. Do **NOT** invent or assume any numbers.
- If the user asks anything that cannot be answered from this data (for example, stock tips, global markets, future predictions, or other people's data), clearly say that you can only answer questions about **their HamAI budgeting data**.
- When numbers are requested, calculate them precisely from the provided data.
- If the question is vague, infer the most helpful interpretation **about their data** and clearly state your assumptions.
- Always speak as **\"Mr. Ham\"**, keep the tone warm and professional. In the main explanation and bullet points, focus on neutral, precise language; pig-themed phrasing should be minimal and never appear inside numeric summaries or bullet labels.
- Prefer short paragraphs and bullet points. Avoid long essays or story-like text.
- Currency is in whatever units the data uses (usually dollars); do not change currency.

USER QUESTION:
${question}

USER BUDGET DATA (JSON):
${contextJson}

Now answer the user's question using ONLY this data.

If helpful, you may include:
- High-level summary (1–3 bullets)
- Specific numbers (totals, averages, top categories, trends)
- Actionable suggestions based on their own spending patterns

Do NOT return JSON. Respond in plain text/markdown as Mr. Ham.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Gemini insights (Mr.Ham) error:', error);
    throw new Error('Mr. Ham is having trouble answering right now. Please try again in a moment.');
  }
};

export const parseBatchEntries = async (text, userCategories = null, userReceivers = []) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const expenseCategories = userCategories && userCategories.length > 0 ? userCategories : defaultCategories;
    const incomeCategories = [...new Set([...defaultIncomeCategories, ...expenseCategories])];
    const allCategories = [...new Set([...defaultIncomeCategories, ...expenseCategories])];

    const knownReceivers = [...new Set([...defaultIncomeSenders, ...userReceivers])].join(', ');
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const prompt = `You are a financial data extraction assistant. The user wants to add multiple budget transactions in bulk.

User input:
"${text}"

Your job:
1. If the input is clearly structured financial data (mentions amounts, months/dates, income or expense context), extract ALL transactions into an array.
2. If the input is vague, conversational, or has no recognizable financial data, set entries to [] and provide a helpful error message.

Known senders/receivers for this user: ${knownReceivers}
Available expense categories: ${expenseCategories.join(', ')}
Available income categories: ${incomeCategories.join(', ')}
Month names: ${monthNames.join(', ')}

Return a JSON object with this exact structure:
{
  "entries": [
    {
      "month": <1-12 integer>,
      "year": <4-digit integer>,
      "type": "income" or "expense",
      "receiver": "sender name (if income) or receiver/store name (if expense)",
      "items": [{"name": "description", "amount": <number>}],
      "subtotal": <number>,
      "stateTax": <number, only for income, default 0>,
      "federalTax": <number, only for income, default 0>,
      "tax": <number — for income: stateTax+federalTax; for expense: sales/other tax; default 0>,
      "category": "one of the available categories",
      "notes": "optional context",
      "total": <number — for income: subtotal - tax; for expense: subtotal + tax>
    }
  ],
  "error": null
}

If the input cannot be parsed into structured entries, return:
{
  "entries": [],
  "error": "Unstructured entries — <brief explanation of what was unclear and how to fix it>"
}

Rules:
- Current year is 2025 if not specified
- If month is named (e.g. "August"), convert to number (8)
- For income entries: total = subtotal - tax; stateTax and federalTax should be extracted if mentioned
- For expense entries: total = subtotal + tax
- An entry MUST have at least a receiver/sender, an amount, and a month
- If type is not specified but context implies income (salary, received, payment from person), set type = "income"
- If type is not specified but context implies expense (bought, spent, paid at store), set type = "expense"
- Assign the closest matching category from the lists provided
- Return ONLY valid JSON, no markdown, no explanation text

JSON:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let responseText = response.text().trim();

    if (responseText.includes('```')) {
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) responseText = jsonMatch[1];
    }
    if (!responseText.startsWith('{')) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) responseText = jsonMatch[0];
    }

    const parsed = JSON.parse(responseText);
    if (parsed.error) return { entries: [], error: parsed.error };

    const entries = (parsed.entries || []).map(e => {
      const subtotal = Number(e.subtotal) || (Array.isArray(e.items) ? e.items.reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0);
      const isIncome = e.type === 'income';
      const stateTax = Number(e.stateTax) || 0;
      const federalTax = Number(e.federalTax) || 0;
      const tax = isIncome ? stateTax + federalTax : (Number(e.tax) || 0);
      const total = isIncome ? subtotal - tax : subtotal + tax;
      const cat = (e.category || '').toLowerCase();
      const validCat = allCategories.includes(cat) ? cat : (allCategories.includes('other') ? 'other' : allCategories[0]);
      return {
        month: Number(e.month) || new Date().getMonth() + 1,
        year: Number(e.year) || new Date().getFullYear(),
        type: isIncome ? 'income' : 'expense',
        receiver: e.receiver || (isIncome ? 'Unknown Sender' : 'Unknown'),
        items: Array.isArray(e.items) ? e.items.map(i => ({ name: String(i.name || ''), amount: Number(i.amount) || 0 })) : [{ name: 'Amount', amount: subtotal }],
        subtotal,
        stateTax,
        federalTax,
        tax,
        category: validCat,
        notes: e.notes || '',
        total
      };
    });

    return { entries, error: null };
  } catch (error) {
    console.error('Gemini batch parse error:', error);
    throw new Error('Failed to parse batch entries. Please try again.');
  }
};

export const generateNotes = async (store, items, category) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
