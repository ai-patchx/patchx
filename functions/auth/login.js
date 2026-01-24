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
        JSON.stringify({ message: 'Username and password cannot be empty' }),
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

    // Get admin password from environment
    const getAdminPassword = () => {
      return env.ADMIN_USER_PASSWORD || 'admin';
    };

    const VALID_CREDENTIALS = [
      {
        username: 'patchx',
        password: getTestPassword(),
        role: 'user'
      },
      {
        username: 'admin',
        password: getAdminPassword(),
        role: 'administrator'
      }
    ];

    // Validate credentials
    const validCredential = VALID_CREDENTIALS.find(
      cred => cred.username === username && cred.password === password
    );

    if (!validCredential) {
      return new Response(
        JSON.stringify({ message: 'Invalid username or password' }),
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
      id: username === 'admin' ? 'admin-123' : 'user-123',
      username: username,
      role: validCredential.role
    };

    // Simple token generation
    const token = btoa(JSON.stringify({
      userId: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    }));

    const response = {
      user,
      token,
      message: 'Login successful'
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