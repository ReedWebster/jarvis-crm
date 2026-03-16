import { supabaseAdmin } from '../lib/_supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const provider = url.searchParams.get('provider');

  const keyMap: Record<string, string> = {
    linkedin: 'linkedin_auth',
    meta: 'meta_auth',
    x: 'x_auth',
  };

  const dbKey = provider ? keyMap[provider] : undefined;
  if (!dbKey) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing or invalid provider. Use ?provider=linkedin|meta|x' }));
    return;
  }

  if (!supabaseAdmin) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Supabase admin client is not configured.' }));
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', dbKey)
    .maybeSingle();

  if (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Failed to read ${provider} auth state`, detail: error.message }));
    return;
  }

  const value: any = data?.value ?? null;
  if (!value?.accessToken) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'disconnected' }));
    return;
  }

  const now = new Date();
  const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() <= now.getTime() : false;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: isExpired ? 'needs-reauth' : 'connected',
    expiresAt: value.expiresAt ?? null,
    name: value.name ?? null,
    email: value.email ?? null,
    username: value.username ?? null,
    picture: value.picture ?? null,
    pages: value.pages ?? undefined,
    instagramAccounts: value.instagramAccounts ?? undefined,
  }));
}
