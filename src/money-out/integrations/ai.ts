interface Category {
  id: string;
  name: string;
}

interface CategorizationSuggestion {
  category_id: string;
  confidence: number;
}

export interface AICategorizationResult {
  category_id: string | null;
  confidence: number;
  reasoning?: string;
  suggestions?: CategorizationSuggestion[];
}

const KEYWORD_MAP: Array<{ keywords: string[]; categoryHint: string }> = [
  { keywords: ['uber', 'lyft', 'taxi'], categoryHint: 'Travel' },
  { keywords: ['hotel', 'airbnb', 'airlines', 'flight'], categoryHint: 'Travel' },
  { keywords: ['restaurant', 'cafe', 'meal', 'coffee', 'diner'], categoryHint: 'Meals' },
  { keywords: ['amazon', 'staples', 'office'], categoryHint: 'Office' },
  { keywords: ['adobe', 'slack', 'github', 'software', 'subscription'], categoryHint: 'Software' },
  { keywords: ['bank fee', 'stripe', 'paypal'], categoryHint: 'Bank' },
  { keywords: ['google', 'facebook', 'ads', 'marketing'], categoryHint: 'Advertising' }
];

function findCategoryByHint(categories: Category[], hint: string) {
  const normalizedHint = hint.toLowerCase();
  return categories.find((category) => category.name.toLowerCase().includes(normalizedHint));
}

export async function aiCategorizeTransaction(params: {
  description: string;
  merchant?: string | null;
  categories: Category[];
}): Promise<AICategorizationResult> {
  const combined = `${params.description} ${params.merchant ?? ''}`.toLowerCase();

  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some((keyword) => combined.includes(keyword))) {
      const category = findCategoryByHint(params.categories, entry.categoryHint);
      if (category) {
        return {
          category_id: category.id,
          confidence: 75,
          reasoning: `Matched keywords for ${entry.categoryHint}`,
          suggestions: [
            { category_id: category.id, confidence: 75 }
          ]
        };
      }
    }
  }

  const fallbackSuggestions = params.categories.slice(0, 3).map((category, index) => ({
    category_id: category.id,
    confidence: Math.max(30, 60 - index * 10)
  }));

  return {
    category_id: null,
    confidence: 0,
    suggestions: fallbackSuggestions
  };
}
