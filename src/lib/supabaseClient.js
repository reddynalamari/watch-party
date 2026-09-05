import { createClient } from '@supabase/supabase-js';

// Broadcast + Presence are used purely as in-memory WebSocket features here —
// no database tables required, no cost on Supabase's free tier.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
