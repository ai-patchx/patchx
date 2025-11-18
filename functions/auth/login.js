// Cloudflare Pages Function for login fallback
export async function onRequest(context) {
  const { request, env } = context;

  // Only handle POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

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