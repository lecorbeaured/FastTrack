// ══════════════════════════════════════════════════════════════════
// verify-token.js  —  Netlify serverless function
//
// Called by course pages on load to verify a ?token= query param.
// Returns { valid: true, product, email } or { valid: false }
// ══════════════════════════════════════════════════════════════════

const { getStore } = require('@netlify/blobs');

const ALLOWED_ORIGINS = [
  'https://creditfasttrack10x.live',
  'https://www.creditfasttrack10x.live',
  'http://localhost:3000',
  'http://localhost:8888',
];

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const token = event.queryStringParameters?.token;
  if (!token || token.length < 10) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ valid: false, reason: 'missing' }),
    };
  }

  try {
    const store = getStore('access-tokens');
    const data  = await store.get(token, { type: 'json' });

    if (!data) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ valid: false, reason: 'not_found' }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        valid:   true,
        product: data.product,
        email:   data.email,
        name:    data.name,
      }),
    };
  } catch (err) {
    console.error('Token verify error:', err.message);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ valid: false, reason: 'error' }),
    };
  }
};
