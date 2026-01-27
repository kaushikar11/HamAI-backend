/**
 * Test script for Gemini API parsing
 * Run with: node backend/test-gemini.js
 */

import dotenv from 'dotenv';
import { parseBudgetText } from './services/geminiService.js';

dotenv.config({ path: './backend/.env' });

// Test cases
const testCases = [
  {
    name: 'Simple grocery list',
    text: 'potatoes 1 bag 15\nmilk 2 liters 8\nbread 1 loaf 3',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Restaurant receipt',
    text: 'Restaurant ABC\nPizza: $25.99\nPasta: $18.50\nDrinks: $12.00\nTax: $4.50',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Complex receipt with multiple items',
    text: `Walmart Supercenter
    Apples 2.5 lbs $4.99
    Bananas 3 lbs $2.50
    Milk gallon $3.89
    Bread $2.99
    Eggs dozen $3.29
    Subtotal: $17.66
    Tax: $1.41
    Total: $19.07`,
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Transport/uber receipt',
    text: 'Uber Trip\nFare: $12.50\nService fee: $2.75\nTotal: $15.25',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Utilities bill',
    text: 'Electric Company\nElectricity: $85.50\nService charge: $5.00\nTotal: $90.50',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Shopping mall',
    text: 'Macy\'s Department Store\nShirt: $29.99\nJeans: $49.99\nShoes: $79.99\nTotal: $159.97',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Healthcare/pharmacy',
    text: 'CVS Pharmacy\nPrescription: $15.00\nVitamins: $12.99\nTotal: $27.99',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Subscription service',
    text: 'Netflix Subscription\nMonthly plan: $15.99',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Rent payment',
    text: 'Rent Payment\nMonthly rent: $1200.00\nUtilities included: $50.00\nTotal: $1250.00',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Mixed items - unclear category',
    text: 'Random Store\nItem A: $10\nItem B: $20\nItem C: $15\nTotal: $45',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'Custom user categories',
    text: 'potatoes 1 bag 15\nmilk 2 liters 8',
    categories: ['food', 'bills', 'travel', 'personal', 'work', 'other'] // Custom categories
  },
  {
    name: 'Single item',
    text: 'Coffee: $5.50',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  },
  {
    name: 'No prices mentioned',
    text: 'Bought groceries today\nPotatoes\nMilk\nBread',
    categories: ['grocery', 'utilities', 'rent', 'transport', 'restaurant', 'shopping', 'entertainment', 'healthcare', 'education', 'subscription', 'other']
  }
];

async function runTests() {
  console.log('🧪 Starting Gemini API Tests...\n');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n📝 Test ${i + 1}/${testCases.length}: ${testCase.name}`);
    console.log(`Input text:\n${testCase.text}`);
    console.log(`User categories: ${testCase.categories.join(', ')}`);
    console.log('-'.repeat(80));
    
    try {
      const result = await parseBudgetText(testCase.text, testCase.categories);
      
      console.log('✅ Result:');
      console.log(`  Store: ${result.store}`);
      console.log(`  Items: ${JSON.stringify(result.items, null, 2)}`);
      console.log(`  Subtotal: $${result.subtotal}`);
      console.log(`  Tax: $${result.tax}`);
      console.log(`  Total: $${result.total}`);
      console.log(`  Category: ${result.category}`);
      console.log(`  Notes: ${result.notes || '(none)'}`);
      
      // Validation
      const validations = [];
      
      if (!result.items || result.items.length === 0) {
        validations.push('❌ No items extracted');
      } else {
        validations.push(`✅ Extracted ${result.items.length} item(s)`);
      }
      
      if (!result.store || result.store === 'Unknown Store') {
        validations.push('⚠️  Store not identified (using default)');
      } else {
        validations.push(`✅ Store identified: ${result.store}`);
      }
      
      if (!testCase.categories.includes(result.category)) {
        validations.push(`❌ Category "${result.category}" not in user's category list`);
      } else {
        validations.push(`✅ Category "${result.category}" is valid`);
      }
      
      const calculatedSubtotal = result.items.reduce((sum, item) => sum + (item.amount || 0), 0);
      if (Math.abs(calculatedSubtotal - result.subtotal) > 0.01) {
        validations.push(`⚠️  Subtotal mismatch: calculated ${calculatedSubtotal}, got ${result.subtotal}`);
      } else {
        validations.push('✅ Subtotal matches item sum');
      }
      
      const calculatedTotal = result.subtotal + result.tax;
      if (Math.abs(calculatedTotal - result.total) > 0.01) {
        validations.push(`⚠️  Total mismatch: calculated ${calculatedTotal}, got ${result.total}`);
      } else {
        validations.push('✅ Total matches subtotal + tax');
      }
      
      console.log('\nValidations:');
      validations.forEach(v => console.log(`  ${v}`));
      
      const hasErrors = validations.some(v => v.startsWith('❌'));
      if (hasErrors) {
        failed++;
      } else {
        passed++;
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      console.error(error.stack);
      failed++;
    }
    
    // Small delay between tests to avoid rate limiting
    if (i < testCases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Test Summary:`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log('\n');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
