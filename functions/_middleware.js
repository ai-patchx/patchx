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

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    return handleLogin(context);
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

async function handleLogin(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return new Response(
        JSON.stringify({ message: '用户名和密码不能为空' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          }
        }
      );
    }

    // Get test password from environment
    const getTestPassword = () => {
      return env.TEST_USER_PASSWORD || 'patchx';
    };

    const VALID_CREDENTIALS = {
      username: 'patchx',
      password: getTestPassword()
    };

    // Validate credentials
    if (username !== VALID_CREDENTIALS.username || password !== VALID_CREDENTIALS.password) {
      return new Response(
        JSON.stringify({ message: '用户名或密码错误' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          }
        }
      );
    }

    // Create user and token
    const user = {
      id: 'user-123',
      username: username
    };

    // Simple token generation
    const token = btoa(JSON.stringify({
      userId: user.id,
      username: user.username,
      exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    }));

    const response = {
      user,
      token,
      message: '登录成功'
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({ message: '服务器内部错误' }),
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