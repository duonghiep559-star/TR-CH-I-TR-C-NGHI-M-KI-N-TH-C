import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data, error } = await supabase.from('realtime_scores').select('*').limit(5);
  console.log("realtime_scores data:", data);
  console.log("realtime_scores error:", error);
}

check();
