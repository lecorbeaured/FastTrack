// ══════════════════════════════════════════════════════════════════
// stripe-webhook.js  —  Netlify serverless function
//
// Listens for Stripe "payment_intent.succeeded" events.
// On success:
//   1. Generates a unique access token
//   2. Stores token → { email, product, courseUrl } in Netlify Blobs
//   3. Sends access email via Resend (set RESEND_API_KEY in Netlify env)
//
// ENV VARS REQUIRED (set in Netlify → Site → Environment Variables):
//   STRIPE_SECRET_KEY       — sk_live_...
//   STRIPE_WEBHOOK_SECRET   — whsec_...  (from Stripe webhook dashboard)
//   RESEND_API_KEY          — re_...     (free tier = 3k emails/mo)
//   URL                     — https://creditfasttrack10x.live (auto-set by Netlify)
// ══════════════════════════════════════════════════════════════════

const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto  = require('crypto');
const https   = require('https');
const { getStore } = require('@netlify/blobs');

// ── Course routing ────────────────────────────────────────────────
const COURSE_MAP = {
  'Credit Fast Track 10X':     '/course-updated.html',
  'Credit Repair Accelerator': '/credit-repair-course.html',
  'Business Credit Unleashed': '/business-credit-course.html',
};

// ── Generate a secure random token ───────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Send email via Resend ─────────────────────────────────────────
function sendEmail({ to, name, product, accessUrl }) {
  return new Promise((resolve, reject) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1a6b3c;padding:32px 40px;text-align:center;">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Credit Fast Track 10X</p>
          <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">You're In! 🎉</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;line-height:1.6;">Hi ${name || 'there'},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.7;">
            Your payment for <strong>${product}</strong> was successful. Your personal access link is below — bookmark it so you can come back any time.
          </p>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td align="center">
              <a href="${accessUrl}" style="display:inline-block;background:#1a6b3c;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:8px;letter-spacing:0.02em;">
                ✦ Access My Course →
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#888;">Or copy this link into your browser:</p>
          <p style="margin:0 0 28px;font-size:12px;color:#1a6b3c;word-break:break-all;background:#f0f8f3;padding:12px 14px;border-radius:6px;border:1px solid #c8e6d4;">
            <a href="${accessUrl}" style="color:#1a6b3c;text-decoration:none;">${accessUrl}</a>
          </p>

          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 18px;margin-bottom:28px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
              <strong>💡 Important:</strong> This link is your personal key — save it or bookmark it. 
              If you ever lose it, just reply to this email and we'll resend it.
            </p>
          </div>

          <p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;font-weight:700;">What's included:</p>
          <ul style="margin:8px 0 28px;padding-left:20px;color:#444;font-size:14px;line-height:1.9;">
            <li>Full course — all modules unlocked immediately</li>
            <li>All bonus templates, worksheets &amp; scripts</li>
            <li>Lifetime access — yours forever</li>
            <li>Email support — reply to this email anytime</li>
          </ul>

          <p style="margin:0;font-size:15px;color:#444;line-height:1.7;">
            Questions? Just reply to this email.<br>
            — The Credit Fast Track 10X Team
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f5f0;padding:24px 40px;text-align:center;border-top:1px solid #e5e5e0;">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">
            © ${new Date().getFullYear()} Credit Fast Track 10X · creditfasttrack10x.live<br>
            You received this because you purchased a course. 30-day money-back guarantee.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const payload = JSON.stringify({
      from: 'Credit Fast Track 10X <support@creditfasttrack10x.live>',
      to: [to],
      subject: `✦ Your ${product} access link`,
      html,
    });

    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Resend error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Main handler ──────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Only handle successful payments
  if (stripeEvent.type !== 'payment_intent.succeeded') {
    return { statusCode: 200, body: 'Event ignored' };
  }

  const pi       = stripeEvent.data.object;
  const email    = pi.metadata?.customer_email || pi.receipt_email;
  const name     = pi.metadata?.customer_name  || '';
  const product  = pi.metadata?.product        || 'Credit Fast Track 10X';
  const coursePath = COURSE_MAP[product] || '/course-updated.html';

  if (!email) {
    console.error('No email found on payment intent:', pi.id);
    return { statusCode: 200, body: 'No email — skipped' };
  }

  try {
    // 1. Generate token
    const token = generateToken();
    const siteUrl = process.env.URL || 'https://creditfasttrack10x.live';
    const accessUrl = `${siteUrl}${coursePath}?token=${token}`;

    // 2. Store token in Netlify Blobs (persists forever, serverless KV store)
    const store = getStore('access-tokens');
    await store.setJSON(token, {
      email,
      name,
      product,
      coursePath,
      paymentIntentId: pi.id,
      createdAt: new Date().toISOString(),
    });

    // 3. Send access email
    await sendEmail({ to: email, name, product, accessUrl });

    console.log(`✓ Access granted: ${email} → ${product} → ${token.slice(0,8)}...`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Post-payment processing error:', err.message);
    // Return 200 so Stripe doesn't retry — log the error for manual follow-up
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
