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

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    if (new URL(request.url).pathname.endsWith('.html') || new URL(request.url).pathname === '/') {
      headers.set('Cache-Control', 'no-cache');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
