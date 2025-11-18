// Simple health check for Pages Functions
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Cloudflare Pages Functions',
        endpoints: ['/api/health', '/api/auth/login']
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  return new Response('Not Found', { status: 404 });
}