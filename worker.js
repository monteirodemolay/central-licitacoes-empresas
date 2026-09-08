const SECURITY_HEADERS = {
  // img-src e frame-src precisam do domínio do Supabase: é de lá que vem a
  // pré-visualização de PDF/imagem (signed URL) no modal de edição e no
  // vincular do Acervo. connect-src sozinho não cobre isso — permite o fetch
  // da signed URL, mas não o <img>/<iframe> carregando o arquivo em si.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; connect-src 'self' https://yntnmpwovzqgpuzrrnin.supabase.co wss://yntnmpwovzqgpuzrrnin.supabase.co https://brasilapi.com.br; img-src 'self' data: blob: https://yntnmpwovzqgpuzrrnin.supabase.co; frame-src 'self' https://yntnmpwovzqgpuzrrnin.supabase.co; style-src 'self' 'unsafe-inline'; worker-src 'self' blob: https://cdnjs.cloudflare.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Confirma que quem chamou é o próprio administrador geral autenticado —
// nunca confia em nada vindo do corpo da requisição para isso. O token do
// usuário valida a identidade; a leitura de `perfis` usa a service role
// porque RLS depende de auth.uid(), que não existe fora de uma sessão do
// Supabase.
async function loadCallerAsAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const profileRes = await fetch(`${env.SUPABASE_URL}/rest/v1/perfis?id=eq.${user.id}&select=perfil`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!profileRes.ok) return null;
  const rows = await profileRes.json();
  return rows[0]?.perfil === 'admin_geral' ? user : null;
}

async function handleCreateUser(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Criação de acesso pela página não está configurada neste ambiente.' }, 500);
  }
  const admin = await loadCallerAsAdmin(request, env);
  if (!admin) return jsonResponse({ error: 'Apenas o administrador geral pode criar acessos.' }, 403);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const nome = String(body.nome || '').trim().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
  if (password.length < 6) return jsonResponse({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
  if (!nome) return jsonResponse({ error: 'Informe o nome completo.' }, 400);

  const createRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { nome } })
  });
  const data = await createRes.json();
  if (!createRes.ok) {
    return jsonResponse({ error: data?.msg || data?.error_description || data?.error || 'Não foi possível criar o usuário.' }, createRes.status);
  }
  return jsonResponse({ id: data.id, email: data.email });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/admin/create-user') {
      return withSecurityHeaders(await handleCreateUser(request, env));
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
      headers.set('Cache-Control', 'no-cache');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
