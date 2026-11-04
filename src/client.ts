
import { createClient } from '@supabase/supabase-js';

// Supabase Project Configuration
const SUPABASE_URL =
  'https://fknbkxvylepelivrgfdc.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_xpe0u8ffJ1HdyGBG4lIpWw_5PqAWg1b';

// Initialize Supabase Client
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// API Request Helper
export async function call(
  action: string,
  payload: Record<string, unknown> = {}
) {
  // Get current authenticated session
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session) {
    throw new Error('Please log in again');
  }

  // Send authenticated request to backend
  const response = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  // Handle API response
  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || result.message || 'Request failed'
    );
  }

  return result;
}
