import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wmpcfgkgkbjrjvgiosyk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcGNmZ2tna2Jqcmp2Z2lvc3lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTc3OTksImV4cCI6MjA4NTI3Mzc5OX0.KJlmwzPLzycO8wH8vhJHKF0jYdLAWLmFDEJS4NPMELU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testWrite() {
  const { error } = await supabase.from('classes').insert({ name: 'TestClass' }).select();
  if (error) {
    console.log('Error writing without auth:', error);
  } else {
    console.log('Success writing without auth!');
  }
}

testWrite();
