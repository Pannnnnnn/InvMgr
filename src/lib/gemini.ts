import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from './env';
import { ApiError } from './http';

export type ExtractedItemMention = {
  /** Raw natural-language mention, e.g. "torque wrench" or "Makita drill". */
  mention: string;
  quantity: number;
};

export type CheckoutExtraction = {
  action: 'BORROW' | 'RETURN' | 'UNKNOWN';
  worker_name: string | null;
  /** How the worker's name was identified, for the audit trail / UI. */
  worker_name_source: 'TEXT' | 'BADGE_OCR' | 'NONE';
  items: ExtractedItemMention[];
  /** True when the prompt/image is too ambiguous to safely proceed. */
  needs_clarification: boolean;
  clarification_message: string | null;
};

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    action: {
      type: SchemaType.STRING,
      enum: ['BORROW', 'RETURN', 'UNKNOWN'],
      description: "Whether the worker is borrowing or returning equipment.",
    },
    worker_name: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'The worker\'s name, from spoken/typed text or a visible ID badge in the photo. Null if not identifiable.',
    },
    worker_name_source: {
      type: SchemaType.STRING,
      enum: ['TEXT', 'BADGE_OCR', 'NONE'],
    },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          mention: {
            type: SchemaType.STRING,
            description: 'The item as mentioned by the operator, verbatim or lightly normalized (e.g. "torque wrench").',
          },
          quantity: { type: SchemaType.INTEGER, description: 'Number of units, default 1.' },
        },
        required: ['mention', 'quantity'],
      },
    },
    needs_clarification: {
      type: SchemaType.BOOLEAN,
      description: 'True if the text/image is too vague to determine item(s), quantity, or action.',
    },
    clarification_message: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'A short question to show the operator if needs_clarification is true.',
    },
  },
  required: ['action', 'worker_name', 'worker_name_source', 'items', 'needs_clarification'],
} as const;

const SYSTEM_INSTRUCTION = `You are the entity-extraction step of a factory tool-room checkout agent.
You are given a photo of a worker (optionally showing an ID badge/uniform) and a short
natural-language message from the tool-room operator, e.g. "Took 2 torque wrenches and a multimeter"
or "borrowed 1 cordless impact drill - John Reyes".

Extract, strictly as JSON matching the provided schema:
- action: BORROW (taking equipment) or RETURN (bringing it back). Default to BORROW if unclear
  but the message clearly names items being taken. Use UNKNOWN only if you truly cannot tell.
- worker_name: read it from the text if stated, otherwise attempt to read a name from a visible
  ID badge/uniform in the photo (OCR-style). Do not guess a name from a face alone. Null if unknown.
- items: one entry per distinct item mentioned, with your best-guess quantity (default 1). Keep the
  "mention" close to what the operator said (do not invent a formal catalog name) — a separate
  matching step will resolve it against the real inventory catalog.
- needs_clarification: true only if you cannot extract at least one item mention, or the message is
  genuinely too vague to act on (e.g. "borrowed some stuff"). Do NOT set this just because the item
  name is informal — that's expected and handled downstream.
- clarification_message: a short, operator-facing question when needs_clarification is true.

Do not fabricate items or names that are not supported by the text or image.`;

let _client: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI {
  if (!_client) _client = new GoogleGenerativeAI(env.geminiApiKey);
  return _client;
}

export async function extractCheckoutIntent(params: {
  text: string;
  imageBytes: Uint8Array;
  imageMimeType: string;
}): Promise<CheckoutExtraction> {
  const { text, imageBytes, imageMimeType } = params;

  const model = client().getGenerativeModel({
    model: env.geminiModel,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.1,
    },
  });

  let result;
  try {
    result = await model.generateContent([
      {
        inlineData: {
          data: Buffer.from(imageBytes).toString('base64'),
          mimeType: imageMimeType,
        },
      },
      { text: text?.trim() ? text : '(No text provided by operator — rely on the photo alone.)' },
    ]);
  } catch (err) {
    throw new ApiError(
      502,
      'AI_PROVIDER_ERROR',
      `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const raw = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(502, 'AI_RESPONSE_UNPARSEABLE', 'Gemini returned non-JSON output.', { raw });
  }

  return normalizeExtraction(parsed);
}

function normalizeExtraction(parsed: unknown): CheckoutExtraction {
  const p = parsed as Partial<CheckoutExtraction> & { items?: ExtractedItemMention[] };
  const items = Array.isArray(p.items)
    ? p.items
        .filter((it) => it && typeof it.mention === 'string' && it.mention.trim().length > 0)
        .map((it) => ({
          mention: it.mention.trim(),
          quantity: Number.isFinite(it.quantity) && it.quantity > 0 ? Math.floor(it.quantity) : 1,
        }))
    : [];

  return {
    action: p.action === 'BORROW' || p.action === 'RETURN' ? p.action : 'UNKNOWN',
    worker_name: typeof p.worker_name === 'string' && p.worker_name.trim() ? p.worker_name.trim() : null,
    worker_name_source:
      p.worker_name_source === 'TEXT' || p.worker_name_source === 'BADGE_OCR' ? p.worker_name_source : 'NONE',
    items,
    needs_clarification: Boolean(p.needs_clarification) || items.length === 0,
    clarification_message:
      typeof p.clarification_message === 'string' && p.clarification_message.trim()
        ? p.clarification_message.trim()
        : items.length === 0
          ? 'Could not identify any items in the photo/text. Please clarify what was borrowed.'
          : null,
  };
}

// --- Stock intake: photo of a shelf/box of items -> suggested catalog entries ---

export type StockDetection = {
  name: string;
  quantity: number;
  category: string | null;
  suggested_aliases: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

const stockResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    detections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: 'A clear, specific catalog-style name for this tool/item, e.g. "18V Cordless Hammer Drill".',
          },
          quantity: { type: SchemaType.INTEGER, description: 'Best-guess count of this item visible in the photo.' },
          category: {
            type: SchemaType.STRING,
            nullable: true,
            description: 'A short category, e.g. "Power Tools", "Hand Tools", "Safety Gear". Null if unclear.',
          },
          suggested_aliases: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Other short names/brand terms someone might use for this item, for fuzzy search matching.',
          },
          confidence: { type: SchemaType.STRING, enum: ['HIGH', 'MEDIUM', 'LOW'] },
        },
        required: ['name', 'quantity', 'confidence'],
      },
    },
  },
  required: ['detections'],
} as const;

const STOCK_SYSTEM_INSTRUCTION = `You are the stock-intake vision step of a factory tool-room inventory system.
You are given a photo of a shelf, bin, or box of tools/equipment/parts. Identify every distinct kind of
item visible and estimate how many of each. Group identical items together into one detection with a
quantity, rather than listing duplicates. Use clear, specific, catalog-style names (not brand slogans).
If you cannot confidently identify something, still include it with confidence "LOW" rather than omitting
it — a human will review every suggestion before it's saved, nothing is written automatically. Return an
empty detections array only if the photo shows no identifiable tools/equipment/parts at all.`;

export async function extractStockFromPhoto(params: {
  imageBytes: Uint8Array;
  imageMimeType: string;
}): Promise<StockDetection[]> {
  const { imageBytes, imageMimeType } = params;

  const model = client().getGenerativeModel({
    model: env.geminiModel,
    systemInstruction: STOCK_SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: stockResponseSchema,
      temperature: 0.1,
    },
  });

  let result;
  try {
    result = await model.generateContent([
      {
        inlineData: { data: Buffer.from(imageBytes).toString('base64'), mimeType: imageMimeType },
      },
      { text: 'Identify every distinct tool/equipment/part visible and estimate quantities.' },
    ]);
  } catch (err) {
    throw new ApiError(
      502,
      'AI_PROVIDER_ERROR',
      `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const raw = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(502, 'AI_RESPONSE_UNPARSEABLE', 'Gemini returned non-JSON output.', { raw });
  }

  const detections = (parsed as { detections?: unknown[] })?.detections;
  if (!Array.isArray(detections)) return [];

  return detections
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      name: typeof d.name === 'string' ? d.name.trim() : '',
      quantity: Number.isFinite(d.quantity) && (d.quantity as number) > 0 ? Math.floor(d.quantity as number) : 1,
      category: typeof d.category === 'string' && d.category.trim() ? d.category.trim() : null,
      suggested_aliases: Array.isArray(d.suggested_aliases)
        ? (d.suggested_aliases as unknown[]).filter((a): a is string => typeof a === 'string')
        : [],
      confidence: (d.confidence === 'HIGH' || d.confidence === 'MEDIUM' || d.confidence === 'LOW'
        ? d.confidence
        : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
    }))
    .filter((d) => d.name.length > 0);
}
