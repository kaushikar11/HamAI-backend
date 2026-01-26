/**
 * Sanitize user input to prevent XSS attacks
 * Removes HTML tags and dangerous characters
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>]/g, '') // Remove remaining angle brackets
    .trim()
    .slice(0, 1000); // Limit length
};

/**
 * Sanitize array of items
 */
export const sanitizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  
  return items.map(item => ({
    name: sanitizeInput(item.name || '').slice(0, 200),
    amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0
  }));
};
