import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wmpcfgkgkbjrjvgiosyk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcGNmZ2tna2Jqcmp2Z2lvc3lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTc3OTksImV4cCI6MjA4NTI3Mzc5OX0.KJlmwzPLzycO8wH8vhJHKF0jYdLAWLmFDEJS4NPMELU';

export const supabase = createClient(supabaseUrl, supabaseKey);
