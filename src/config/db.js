const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test the connection
supabase.from('users').select('count').single()
  .then(({ data, error }) => {
    if (error) {
      console.error('Error connecting to Supabase:', error);
      process.exit(1);
    }
    console.log('Successfully connected to Supabase');
  });

module.exports = {
  query: async (text, params) => {
    // Convert PostgreSQL query to Supabase query
    const [table, operation] = text.split(' ').filter(word => 
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(word.toUpperCase())
    );
    
    if (operation?.toUpperCase() === 'SELECT') {
      const { data, error } = await supabase
        .from(table.toLowerCase())
        .select('*');
      
      if (error) throw error;
      return { rows: data };
    }
    
    // For other operations, you'll need to implement specific logic
    // This is a simplified version
    const { data, error } = await supabase
      .from(table.toLowerCase())
      .select('*');
    
    if (error) throw error;
    return { rows: data };
  },
  supabase
}; 