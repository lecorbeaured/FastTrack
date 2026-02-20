const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Product registry — amounts in cents
const PRODUCTS = {
  'Credit Fast Track 10X':          { amount: 3700,  currency: 'usd', name: 'Credit Fast Track 10X' },
  'Credit Repair Accelerator':      { amount: 12700, currency: 'usd', name: 'Credit Repair Accelerator' },
  'Business Credit Unleashed':      { amount: 19700, currency: 'usd', name: 'Business Credit Unleashed' },
};

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://creditfasttrack10x.live',
  'https://www.creditfasttrack10x.live',
  'http://localhost:3000',   // local dev
  'http://localhost:8888',   // netlify dev
];

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';

  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // ── Preflight ────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  // ── Only accept POST ─────────────────────────────────────────────
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { product, email, name } = body;

    // ── Validate product ─────────────────────────────────────────
    const productConfig = PRODUCTS[product];
    if (!productConfig) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Unknown product: ${product}` }),
      };
    }

    // ── Validate email ───────────────────────────────────────────
    if (!email || !email.includes('@')) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Valid email is required' }),
      };
    }

    // ── Find or create Stripe customer ───────────────────────────
    let customer;
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        name: name || '',
        metadata: { source: 'creditfasttrack10x.live' },
      });
    }

    // ── Create Payment Intent ────────────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount: productConfig.amount,
      currency: productConfig.currency,
      customer: customer.id,
      receipt_email: email,
      description: productConfig.name,
      metadata: {
        product: productConfig.name,
        customer_name: name || '',
        customer_email: email,
        source: 'creditfasttrack10x.live',
      },
      automatic_payment_methods: { enabled: true },
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };

  } catch (err) {
    console.error('Stripe error:', err.message);

    // Return Stripe's error message to the frontend if it's a card/validation error
    const isStripeError = err.type && err.type.startsWith('Stripe');
    return {
      statusCode: isStripeError ? 402 : 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: isStripeError ? err.message : 'Payment processing error. Please try again.' }),
    };
  }
};
