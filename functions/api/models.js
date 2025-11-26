// Cloudflare Pages Function for /api/models endpoint
// Fetches models from LiteLLM with OpenAI API compatibility
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  // Handle OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only handle GET requests
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Method not allowed'
      }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }

  try {
    // Check if litellm is configured
    if (!env.LITELLM_BASE_URL || !env.LITELLM_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'LiteLLM is not configured. Please set LITELLM_BASE_URL and LITELLM_API_KEY in environment variables.'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Fetch models from litellm
    const baseUrl = env.LITELLM_BASE_URL.replace(/\/$/, ''); // Remove trailing slash
    const modelsUrl = `${baseUrl}/models`;

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.LITELLM_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch models from LiteLLM: ${response.status} ${errorText}`);
    }

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`LiteLLM returned non-JSON response (${contentType}). Response: ${text.substring(0, 200)}`);
    }

    const data = await response.json();

    // Handle different response formats from LiteLLM
    // LiteLLM /models endpoint may return:
    // - { data: [{ id, ... }] } (OpenAI-compatible format)
    // - [{ id, ... }] (direct array)
    // - { models: [{ id, ... }] } (alternative format)
    let modelsArray = [];

    if (Array.isArray(data)) {
      modelsArray = data;
    } else if (data.data && Array.isArray(data.data)) {
      modelsArray = data.data;
    } else if (data.models && Array.isArray(data.models)) {
      modelsArray = data.models;
    }

    // Extract model IDs and format them
    // Provider can be extracted from model ID (e.g., "ollama-deepseek-v3.1" -> "ollama")
    const extractProvider = (modelId, ownedBy) => {
      if (ownedBy && ownedBy !== 'openai') {
        return ownedBy;
      }
      // Extract provider from model ID prefix (e.g., "ollama-", "openrouter-", "claude-")
      const parts = modelId.split('-');
      if (parts.length > 1) {
        const provider = parts[0];
        // Map common prefixes to readable names
        const providerMap = {
          'ollama': 'Ollama',
          'openrouter': 'OpenRouter',
          'claude': 'Anthropic Claude',
          'cloudflare': 'Cloudflare',
          'qiniu': 'Qiniu',
          'siliconflow': 'SiliconFlow',
          'vercel': 'Vercel',
          'volcengine': 'VolcEngine',
          'cerebras': 'Cerebras'
        };
        return providerMap[provider.toLowerCase()] || provider;
      }
      return ownedBy || 'unknown';
    };

    const models = modelsArray.map((model) => {
      const modelId = model.id || model.model_id || model.name || String(model);
      return {
        id: modelId,
        name: modelId,
        provider: extractProvider(modelId, model.owned_by || model.provider)
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: models
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  } catch (error) {
    console.error('Error fetching models from LiteLLM:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch models from LiteLLM'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }
}

