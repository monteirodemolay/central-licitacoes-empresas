const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; connect-src 'self' https://yntnmpwovzqgpuzrrnin.supabase.co wss://yntnmpwovzqgpuzrrnin.supabase.co; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob: https://cdnjs.cloudflare.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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
