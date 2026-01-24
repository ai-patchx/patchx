// Cloudflare Pages Function for login - proxies to Worker to use Worker's env vars
export async function onRequestPost(context) {
  const { request } = context;
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
    console.error('Error proxying login to Worker:', error);
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