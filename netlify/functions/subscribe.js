const { getStore } = require('@netlify/blobs');
const { Resend }   = require('resend');

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { name, email, source } = JSON.parse(event.body || '{}');

    if (!email || !email.includes('@')) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Valid email required' }) };
    }

    const firstName  = name ? name.split(' ')[0] : 'there';
    const emailKey   = email.toLowerCase().trim();
    const store      = getStore('subscribers');
    const existing   = await store.get(emailKey);

    if (!existing) {
      await store.set(emailKey, JSON.stringify({
        name:          name || '',
        email:         emailKey,
        source:        source || 'unknown',
        subscribedAt:  new Date().toISOString(),
      }));
    }

    const resend  = new Resend(process.env.RESEND_API_KEY);
    const siteUrl = process.env.URL || 'https://creditfasttrack10x.live';

    await resend.emails.send({
      from:    'Credit Fast Track 10X <hello@creditfasttrack10x.live>',
      to:      email,
      subject: `${firstName}, here's your Dispute Letter Pack 📬`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0e0e0e;">
          <div style="background:#1a6b3c;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="color:#fff;font-size:20px;font-weight:700;margin:0;font-family:Georgia,serif;">Credit Fast Track 10X</p>
          </div>
          <div style="background:#faf8f3;padding:32px;border:1px solid #e0d9cc;border-top:none;border-radius:0 0 12px 12px;">
            <h2 style="font-family:Georgia,serif;font-size:24px;margin-top:0;">Hey ${firstName} — your guide is ready 👇</h2>
            <p>Thanks for joining. Here's your <strong>10-Template Dispute Letter Pack</strong> — 10 certified-mail-ready FCRA dispute letters covering every major credit report error.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${siteUrl}/downloads/dispute-letters.pdf"
                 style="background:#1a6b3c;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">
                📄 Download Your Dispute Letters
              </a>
            </div>
            <p style="font-size:14px;color:#7a7265;"><strong>What's inside (10 templates):</strong></p>
            <ul style="font-size:14px;color:#7a7265;padding-left:20px;line-height:2.1;">
              <li>Account Not Mine</li>
              <li>Incorrect Status</li>
              <li>Duplicate Entry</li>
              <li>Outdated Item (7-Year Rule)</li>
              <li>Incorrect Balance</li>
              <li>Late Payment Dispute</li>
              <li>Pay for Delete Letter</li>
              <li>Goodwill Letter</li>
              <li>Debt Validation Request</li>
              <li>Escalation Letter (when bureaus go silent)</li>
            </ul>
            <hr style="border:none;border-top:1px solid #e0d9cc;margin:24px 0;">
            <p style="font-size:14px;color:#7a7265;">You're now on the early access list for <strong>Credit Fast Track 10X</strong>. When the course opens you'll be the first to know — and first in line for the launch discount.</p>
            <p style="font-size:13px;color:#a09890;margin-top:24px;">Questions? Just reply to this email.<br>— Credit Fast Track 10X Team</p>
          </div>
        </div>
      `,
    });

    return {
      statusCode: 200,
      headers:    corsHeaders,
      body:       JSON.stringify({ success: true, alreadySubscribed: !!existing }),
    };

  } catch (err) {
    console.error('Subscribe error:', err.message);
    return {
      statusCode: 500,
      headers:    corsHeaders,
      body:       JSON.stringify({ error: 'Something went wrong. Please try again.' }),
    };
  }
};
