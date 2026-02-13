// Cloudflare Pages Function for API routes
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Proxy /api/auth/login to Worker for sign-in (Worker has TEST_USER_PASSWORD and ADMIN_USER_PASSWORD env vars configured)
  if (pathname === '/api/auth/login') {
    const workerUrl = 'https://patchx-service.angersax.workers.dev';
    try {
      const url = new URL(request.url);
      const workerRequestUrl = `${workerUrl}${url.pathname}${url.search}`;

      const workerResponse = await fetch(workerRequestUrl, {
        method: request.method,
        headers: {
          ...Object.fromEntries(request.headers.entries()),
          'Host': new URL(workerUrl).hostname
        },
        body: await request.clone().arrayBuffer()
      });

      // Return the Worker's response with CORS headers
      const responseHeaders = new Headers(workerResponse.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return new Response(workerResponse.body, {
        status: workerResponse.status,
        statusText: workerResponse.statusText,
        headers: responseHeaders
      });
    } catch (error) {
      console.error('Error proxying sign-in to Worker:', error);
      return new Response(
        JSON.stringify({ message: 'Internal server error' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          }
        }
      );
    }
  }

  // Return 404 for other routes
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}