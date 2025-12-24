// Cloudflare Pages Function catch-all for API routes
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // Proxy /api/auth/login to Worker (Worker has TEST_USER_PASSWORD and ADMIN_USER_PASSWORD env vars configured)
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/models to Worker (Worker has LiteLLM env vars configured)
  if (pathname === '/api/models' && request.method === 'GET') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/projects to Worker (Worker has Gerrit env vars configured)
  if (pathname === '/api/projects' && request.method === 'GET') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/projects/:project/branches to Worker
  if (pathname.startsWith('/api/projects/') && pathname.endsWith('/branches') && request.method === 'GET') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/nodes routes to Worker
  if (pathname === '/api/nodes' && (request.method === 'GET' || request.method === 'POST')) {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  if (pathname === '/api/nodes/test-config' && request.method === 'POST') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/nodes/:id routes to Worker
  if (pathname.startsWith('/api/nodes/') && (request.method === 'PUT' || request.method === 'DELETE')) {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/nodes/:id/test to Worker
  if (pathname.startsWith('/api/nodes/') && pathname.endsWith('/test') && request.method === 'POST') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/email/test to Worker
  if (pathname === '/api/email/test' && request.method === 'POST') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/git/clone to Worker
  if (pathname === '/api/git/clone' && request.method === 'POST') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/settings routes to Worker
  if (pathname === '/api/settings' && (request.method === 'GET' || request.method === 'PUT')) {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  // Proxy /api/settings/test-litellm to Worker
  if (pathname === '/api/settings/test-litellm' && request.method === 'POST') {
    return proxyToWorker(request, 'https://patchx-service.angersax.workers.dev');
  }

  return context.next();
}

async function proxyToWorker(request, workerUrl) {
  try {
    const url = new URL(request.url);
    const workerRequestUrl = `${workerUrl}${url.pathname}${url.search}`;

    const workerResponse = await fetch(workerRequestUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'Host': new URL(workerUrl).hostname
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().arrayBuffer() : null
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
    console.error('Error proxying to Worker:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Failed to proxy request to Worker: ${error.message}`
      }),
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
