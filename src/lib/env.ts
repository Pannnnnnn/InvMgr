// Centralized, validated access to environment variables. Throws early
// (at first use, not at import time) with a clear message rather than
// letting `undefined` leak into a Supabase/Gemini client constructor.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get storageBucket() {
    return process.env.SUPABASE_STORAGE_BUCKET || 'worker-photos';
  },
  get geminiApiKey() {
    return required('GEMINI_API_KEY');
  },
  get geminiModel() {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  },
  get signedUrlTtlSeconds() {
    const raw = process.env.SIGNED_URL_TTL_SECONDS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
  },
};
