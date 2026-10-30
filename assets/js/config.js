// ══════════════════════════════════════
// CONFIGURATION SUPABASE (partagée login + dashboard)
// ══════════════════════════════════════
const SUPABASE_URL = 'https://upbeyozsglyjryqpgray.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmV5b3pzZ2x5anJ5cXBncmF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Mjk3MjEsImV4cCI6MjA4OTEwNTcyMX0.s7qd2k4dAf4eFJ1uLww77esHxh7Ag3sy4Kb_Pj7K4kg';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
