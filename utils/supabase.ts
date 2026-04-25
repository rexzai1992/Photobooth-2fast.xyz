import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mngxpbwscmgmgzfctcwl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3hwYndzY21nbWd6ZmN0Y3dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MTU3MDEsImV4cCI6MjA4NDI5MTcwMX0.DoA-B3SsnxGBhlMtY5owJBU7-ZHXHmyFClgb7N4SvIc';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
