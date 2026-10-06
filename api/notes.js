import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    return res.status(503).json({ error: 'Server data source is not configured.' });
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase
    .from('notes')
    .select('title, content')
    .order('id', { ascending: true });

  if (error) {
    return res.status(502).json({ error: 'Unable to load notes.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ notes: data ?? [] });
}
