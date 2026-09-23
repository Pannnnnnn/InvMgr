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

export type TransactionStatus = 'BORROWED' | 'RETURNED';

export type Transaction = {
  id: string;
  item_id: string;
  quantity: number;
  worker_name: string | null;
  photo_url: string;
  operator_id: string | null;
  status: TransactionStatus;
  notes: string | null;
  borrowed_at: string;
  returned_at: string | null;
};

export type TransactionWithItem = Transaction & {
  item: Pick<Item, 'id' | 'sku' | 'name' | 'category'> | null;
  /** Short-lived signed URL for the worker photo, resolved at read time. */
  photo_signed_url: string | null;
};
