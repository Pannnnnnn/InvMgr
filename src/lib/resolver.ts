import { supabaseAdmin } from './supabase';
import type { Item } from './types';
import type { ExtractedItemMention } from './gemini';

// Trigram similarity thresholds. Tuned conservatively: PRD 2.2 targets
// >95% item extraction accuracy, so we'd rather ask for clarification than
// silently resolve to the wrong tool.
const AUTO_MATCH_THRESHOLD = 0.45;
const AMBIGUOUS_GAP = 0.08; // if top-2 candidates are within this, treat as ambiguous

export type ItemCandidate = Pick<
  Item,
  'id' | 'sku' | 'name' | 'category' | 'available_quantity' | 'total_quantity'
> & { similarity: number };

export type ResolvedMention =
  | {
      status: 'MATCHED';
      mention: string;
      quantity: number;
      item: ItemCandidate;
    }
  | {
      status: 'NOT_FOUND';
      mention: string;
      quantity: number;
      candidates: ItemCandidate[];
    }
  | {
      status: 'AMBIGUOUS';
      mention: string;
      quantity: number;
      candidates: ItemCandidate[];
    };

/**
 * Resolves each raw item mention extracted by Gemini against the real
 * inventory catalog using Postgres trigram similarity (see search_items in
 * 0002_rpc_functions.sql). This keeps catalog matching authoritative and
 * server-side rather than trusting the LLM to know/invent SKUs.
 */
export async function resolveMentions(mentions: ExtractedItemMention[]): Promise<ResolvedMention[]> {
  const results: ResolvedMention[] = [];

  for (const mention of mentions) {
    const { data, error } = await supabaseAdmin().rpc('search_items', {
      p_query: mention.mention,
      p_limit: 5,
    });

    if (error) {
      results.push({ status: 'NOT_FOUND', mention: mention.mention, quantity: mention.quantity, candidates: [] });
      continue;
    }

    const candidates = (data ?? []) as ItemCandidate[];
    const top = candidates[0];
    const second = candidates[1];

    if (!top || top.similarity < AUTO_MATCH_THRESHOLD) {
      results.push({
        status: 'NOT_FOUND',
        mention: mention.mention,
        quantity: mention.quantity,
        candidates,
      });
      continue;
    }

    if (second && top.similarity - second.similarity < AMBIGUOUS_GAP) {
      results.push({
        status: 'AMBIGUOUS',
        mention: mention.mention,
        quantity: mention.quantity,
        candidates,
      });
      continue;
    }

    results.push({
      status: 'MATCHED',
      mention: mention.mention,
      quantity: mention.quantity,
      item: top,
    });
  }

  return results;
}
