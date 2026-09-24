// Client-side mirror of the /api/checkout and /api/transactions/manual
// response shapes (see src/app/api/checkout/route.ts and src/lib/checkout.ts).
// Kept separate from the server files so this can be imported freely from
// client components without pulling in server-only code.

export type TransactionResult = {
  id: string;
  item_id: string;
  quantity: number;
  worker_name: string | null;
  status: 'BORROWED' | 'RETURNED';
  borrowed_at: string;
  returned_at: string | null;
  photo_signed_url: string | null;
  item: { id: string; sku: string; name: string; category: string | null } | null;
};

export type ItemCandidate = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  available_quantity: number;
  total_quantity: number;
  similarity: number;
};

export type ResolvedMention =
  | { status: 'MATCHED'; mention: string; quantity: number; item: ItemCandidate }
  | { status: 'NOT_FOUND'; mention: string; quantity: number; candidates: ItemCandidate[] }
  | { status: 'AMBIGUOUS'; mention: string; quantity: number; candidates: ItemCandidate[] };

export type CheckoutExtraction = {
  action: 'BORROW' | 'RETURN' | 'UNKNOWN';
  worker_name: string | null;
  worker_name_source: 'TEXT' | 'BADGE_OCR' | 'NONE';
  items: { mention: string; quantity: number }[];
  needs_clarification: boolean;
  clarification_message: string | null;
};

export type CheckoutResponse =
  | { status: 'CONFIRMED'; worker_name: string | null; worker_name_source: string; transactions: TransactionResult[] }
  | {
      status: 'CLARIFICATION_NEEDED';
      message: string;
      extraction: CheckoutExtraction;
      resolutions?: ResolvedMention[];
    }
  | { status: 'ACTION_NOT_SUPPORTED_HERE'; message: string; extraction: CheckoutExtraction };

export type ManualCheckoutResponse = {
  status: 'CONFIRMED';
  worker_name: string | null;
  transactions: TransactionResult[];
};

export type CartLine = { item: Item; quantity: number };

export type StockScanSuggestion = {
  name: string;
  quantity: number;
  category: string | null;
  suggested_aliases: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  candidates: ItemCandidate[];
};

export type Item = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  aliases: string[];
  total_quantity: number;
  available_quantity: number;
  created_at: string;
  updated_at: string;
};
