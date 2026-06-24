require('dotenv').config();

// Enforce critical environment variables checks on startup
const criticalEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_JWT_SECRET',
  'RESEND_API_KEY',
  'RESEND_SUPPORT_API_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET'
];
const missingEnvVars = criticalEnvVars.filter(v => !process.env[v] || process.env[v].startsWith('YOUR_'));
if (missingEnvVars.length > 0) {
  console.error(`❌ CRITICAL STARTUP ERROR: The following required environment variables are missing or set to placeholder values:\n${missingEnvVars.map(v => `   - ${v}`).join('\n')}\nExiting server process.`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { withSupabase } = require('@supabase/server');
const { createClient } = require('@supabase/supabase-js');
const Razorpay = require('razorpay');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize Supabase Admin client for background Cron runners
const supabaseAdminUrl = process.env.SUPABASE_URL;
const supabaseAdminKey = process.env.SUPABASE_SECRET_KEY;
const supabaseAdmin = supabaseAdminUrl && supabaseAdminKey 
  ? createClient(supabaseAdminUrl, supabaseAdminKey, { auth: { persistSession: false } })
  : null;

const app = express();
const PORT = process.env.PORT || 3000;

// Enable cookie parser middleware for admin auth cookies early
app.use(cookieParser());

// Initialize Razorpay Client
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpay = razorpayKeyId && razorpayKeySecret ? new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret
}) : null;

// Global Static File Protection Middleware
app.use((req, res, next) => {
  const cleanPath = req.path.toLowerCase();
  
  // Sensitive root files
  const sensitiveFiles = [
    '/server.js',
    '/schema.sql',
    '/apply-schema.js',
    '/package.json',
    '/package-lock.json',
    '/.env',
    '/.gitignore',
    '/readme.md',
    '/release_notes.md'
  ];
  
  if (sensitiveFiles.includes(cleanPath) || cleanPath.startsWith('/.git')) {
    return res.status(403).send('Forbidden: Direct access to this file is not allowed.');
  }

  // Prevent direct access to admin source files via static serving
  if (cleanPath === '/admin/index.html' || cleanPath === '/admin/admin.js' || cleanPath === '/admin/login.html') {
    const token = req.cookies?.admin_session;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
        if (decoded.email === process.env.ADMIN_EMAIL && decoded.role === 'admin') {
          return next();
        }
      } catch (err) {
        // Invalid session
      }
    }
    return res.status(403).send('Forbidden: Direct access to admin source files is not allowed.');
  }
  
  next();
});

// Global security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content-Security-Policy header
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: https://lh3.googleusercontent.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com; " +
    "connect-src 'self' https://ojlamxgpcgchqrmpuugl.supabase.co wss://ojlamxgpcgchqrmpuugl.supabase.co https://api.razorpay.com https://cdn.jsdelivr.net;"
  );

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

// Memory-safe in-memory rate limit store
const rateLimitStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000); // Clean up expired entries every 10 minutes

function createRateLimiter({ windowMs, max, message }) {
  return (req, res, next) => {
    // Basic IP detection (trusting standard headers if configured, falling back safely)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
    }

    record.count++;
    rateLimitStore.set(key, record);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      console.warn(`[Rate Limit Hit] IP: ${ip} hit threshold on ${req.path} (${record.count}/${max})`);
      return res.status(429).json({
        success: false,
        error: message || 'Too many requests. Please try again later.'
      });
    }

    next();
  };
}

// Define specific rate limit instances
const publicContactLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 5,
  message: 'Feedback/Support submission limit exceeded. Please try again in 15 minutes.'
});

const adminLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 5,
  message: 'Too many admin login attempts. Access temporarily locked for 15 minutes.'
});

const clientAuthLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 60,
  message: 'Too many API requests. Please slow down.'
});

// Setup CORS middleware for local extension development and production
const allowedOrigins = ['https://meter-ai.app'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      origin.startsWith('chrome-extension://') || 
      origin.startsWith('moz-extension://') || 
      origin === 'http://localhost' || 
      origin.startsWith('http://localhost:') || 
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV === 'production') {
      return callback(new Error('Not allowed by CORS'));
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Express parser with rawBody verification callback
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'terms.html'));
});

// HTML Sanitizer helper (simple escape to avoid XSS)
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Express middleware helper to bridge standard fetch-based withSupabase handlers.
 */
function handleWithSupabase(authMode, handler) {
  const webHandler = withSupabase({ auth: authMode }, handler);
  return async (req, res, next) => {
    try {
      // 1. Convert Express Request to Web API Request
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val) {
          if (Array.isArray(val)) {
            val.forEach(v => headers.append(key, v));
          } else {
            headers.set(key, val);
          }
        }
      }
      
      const init = {
        method: req.method,
        headers,
      };
      
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = req.rawBody || JSON.stringify(req.body);
      }
      
      const webReq = new Request(url, init);
      
      // 2. Call the withSupabase wrapped fetch handler
      const webRes = await webHandler(webReq);
      
      // 3. Convert Web API Response back to Express Response
      res.status(webRes.status);
      webRes.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });
      
      const bodyText = await webRes.text();
      res.send(bodyText);
    } catch (err) {
      console.error(`Error in handleWithSupabase (${authMode}):`, err);
      res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
    }
  };
}

// Secure Audit Event Logging helper
async function logSubscriptionEvent(supabaseAdmin, userId, event, paymentId = null, subscriptionId = null) {
  try {
    await supabaseAdmin
      .from('subscription_events')
      .insert({
        user_id: userId,
        event: event,
        payment_id: paymentId,
        subscription_id: subscriptionId
      });
  } catch (err) {
    console.error('[Audit Log Error] Failed to log subscription event:', err);
  }
}



// ─── API Feedback POST Endpoint ──────────────────────────────────────
app.post('/api/feedback', publicContactLimiter, handleWithSupabase('none', async (req, ctx) => {
  try {
    const body = await req.json();
    const { name, email, rating, message } = body;

    // 1. Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json({ success: false, error: 'Name is required.' }, { status: 400 });
    }

    if (rating === undefined || rating === null || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return Response.json({ success: false, error: 'Rating is required (must be 1 to 5).' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return Response.json({ success: false, error: 'Message is required.' }, { status: 400 });
    }

    if (message.length > 500) {
      return Response.json({ success: false, error: 'Message must not exceed 500 characters.' }, { status: 400 });
    }

    // Optional email validation
    if (email && (typeof email !== 'string' || !email.includes('@'))) {
      return Response.json({ success: false, error: 'Invalid email address format.' }, { status: 400 });
    }

    // 2. Sanitization & Dynamic Section Generation
    let sectionsHtml = '';
    
    // Header Section
    sectionsHtml += `
      <div style="text-align: center; margin-bottom: 30px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 20px;">
        <span style="font-size: 28px; display: block; margin-bottom: 8px;">📝</span>
        <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">New Feedback Received</h1>
      </div>
    `;

    // Name
    if (name && name.trim()) {
      sectionsHtml += `
        <div style="margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888888; letter-spacing: 0.05em; margin-bottom: 6px;">Name</div>
          <div style="font-size: 15px; color: #ffffff; font-weight: 500;">${escapeHTML(name.trim())}</div>
        </div>
      `;
    }

    // Email
    if (email && email.trim()) {
      sectionsHtml += `
        <div style="margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888888; letter-spacing: 0.05em; margin-bottom: 6px;">Email</div>
          <div style="font-size: 15px; color: #ffffff; font-weight: 500;"><a href="mailto:${escapeHTML(email.trim())}" style="color: #D85A30; text-decoration: none;">${escapeHTML(email.trim())}</a></div>
        </div>
      `;
    }

    // Rating
    if (rating !== undefined && rating !== null) {
      const cleanRating = parseInt(rating);
      const ratingStarsStr = '⭐'.repeat(cleanRating);
      sectionsHtml += `
        <div style="margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888888; letter-spacing: 0.05em; margin-bottom: 6px;">Rating</div>
          <div style="font-size: 18px; letter-spacing: 2px;">${ratingStarsStr}</div>
        </div>
      `;
    }

    // Message
    if (message && message.trim()) {
      sectionsHtml += `
        <div style="margin-bottom: 8px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888888; letter-spacing: 0.05em; margin-bottom: 6px;">Message</div>
          <div style="font-size: 14px; color: #eeeeee; line-height: 1.6; background-color: #141414; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 16px; font-style: italic; font-family: Georgia, serif;">
            "${escapeHTML(message.trim()).replace(/\n/g, '<br>')}"
          </div>
        </div>
      `;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Feedback Received</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050505; color: #eeeeee; margin: 0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #0f0f0f; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 32px; box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);">
          ${sectionsHtml}
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 11px; color: #666666;">
          Meter AI • Sent via Resend API
        </div>
      </body>
      </html>
    `;

    const cleanRating = parseInt(rating);
    const subjectLine = `New Feedback - ${cleanRating} Star Rating`;

    // 3. Load Resend API Credentials
    const resendApiKey = process.env.RESEND_API_KEY;

    // Check key availability
    if (!resendApiKey || resendApiKey === 'YOUR_RESEND_API_KEY') {
      console.warn('Feedback API Error: Resend credentials not configured.');
      return Response.json({
        success: false,
        error: 'Email delivery backend not configured. Please add API credentials.'
      }, { status: 500 });
    }

    // 4. Post Payload to Resend REST Endpoints
    const postData = JSON.stringify({
      from: 'Meter AI Feedback <onboarding@resend.dev>',
      to: 'harshaparisha@gmail.com',
      subject: subjectLine,
      html: emailHtml
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    await new Promise((resolve, reject) => {
      const emailReq = https.request(options, (emailRes) => {
        let responseBody = '';
        emailRes.on('data', (chunk) => {
          responseBody += chunk;
        });

        emailRes.on('end', () => {
          if (emailRes.statusCode >= 200 && emailRes.statusCode < 300) {
            console.log(`Feedback submitted successfully. Resend response: ${responseBody}`);
            resolve();
          } else {
            console.error(`Resend API Error (HTTP ${emailRes.statusCode}): ${responseBody}`);
            reject(new Error(`Email delivery API error: ${responseBody}`));
          }
        });
      });

      emailReq.on('error', (err) => {
        console.error('Resend Network Connection Error:', err);
        reject(new Error('Failed to establish network connection to email delivery provider.'));
      });

      emailReq.write(postData);
      emailReq.end();
    });

    // 5. Save to public.admin_feedback database table
    try {
      if (supabaseAdmin) {
        let userId = null;
        if (email && email.trim()) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email.trim())
            .maybeSingle();
          if (profile) userId = profile.id;
        }
        await supabaseAdmin.from('admin_feedback').insert({
          user_id: userId,
          user_email: email ? email.trim() : null,
          user_name: name.trim(),
          rating: cleanRating,
          message: message.trim()
        });
      }
    } catch (dbErr) {
      console.error('[Database Error] Failed to write feedback to DB:', dbErr);
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Feedback Server Error:', error);
    return Response.json({
      success: false,
      error: error.message || 'An unexpected internal server error occurred.'
    }, { status: 500 });
  }
}));

// ─── API Support POST Endpoint ──────────────────────────────────────
app.post('/api/support', publicContactLimiter, handleWithSupabase('none', async (req, ctx) => {
  try {
    const body = await req.json();
    const { email, message, metadata } = body;

    // 1. Validation
    if (!message || typeof message !== 'string' || !message.trim()) {
      return Response.json({ success: false, error: 'Message is required.' }, { status: 400 });
    }

    if (message.length > 2000) {
      return Response.json({ success: false, error: 'Message must not exceed 2000 characters.' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return Response.json({ success: false, error: 'Invalid email address format.' }, { status: 400 });
    }

    // 2. Format HTML
    let metadataHtml = '';
    if (metadata) {
      metadataHtml = `
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888888; letter-spacing: 0.05em; margin-bottom: 8px;">User Metadata</div>
          <table style="width: 100%; font-size: 13px; color: #eeeeee; border-collapse: collapse;">
            ${metadata.name ? `<tr><td style="padding: 4px 0; color: #888888; width: 120px;">Name:</td><td style="padding: 4px 0;">${escapeHTML(metadata.name)}</td></tr>` : ''}
            ${metadata.email ? `<tr><td style="padding: 4px 0; color: #888888;">Email:</td><td style="padding: 4px 0;">${escapeHTML(metadata.email)}</td></tr>` : ''}
            ${metadata.plan ? `<tr><td style="padding: 4px 0; color: #888888;">Plan:</td><td style="padding: 4px 0;">${escapeHTML(metadata.plan.toUpperCase())}</td></tr>` : ''}
            ${metadata.appVersion ? `<tr><td style="padding: 4px 0; color: #888888;">App Version:</td><td style="padding: 4px 0;">${escapeHTML(metadata.appVersion)}</td></tr>` : ''}
            ${metadata.browserInfo ? `<tr><td style="padding: 4px 0; color: #888888;">Browser Info:</td><td style="padding: 4px 0; font-family: monospace; font-size: 11px;">${escapeHTML(metadata.browserInfo)}</td></tr>` : ''}
          </table>
        </div>
      `;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Support Ticket</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050505; color: #eeeeee; margin: 0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #0f0f0f; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 32px; box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);">
          <div style="text-align: center; margin-bottom: 30px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 20px;">
            <span style="font-size: 28px; display: block; margin-bottom: 8px;">✉️</span>
            <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">New Support Ticket</h1>
          </div>
          <div style="margin-bottom: 24px;">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888888; letter-spacing: 0.05em; margin-bottom: 6px;">From</div>
            <div style="font-size: 15px; color: #ffffff; font-weight: 500;"><a href="mailto:${escapeHTML(email.trim())}" style="color: #D85A30; text-decoration: none;">${escapeHTML(email.trim())}</a></div>
          </div>
          <div style="margin-bottom: 24px;">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888888; letter-spacing: 0.05em; margin-bottom: 6px;">Message</div>
            <div style="font-size: 14px; color: #eeeeee; line-height: 1.6; background-color: #141414; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 16px; font-family: sans-serif;">
              ${escapeHTML(message.trim()).replace(/\n/g, '<br>')}
            </div>
          </div>
          ${metadataHtml}
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 11px; color: #666666;">
          Meter AI Support Ticket • Sent via Resend API
        </div>
      </body>
      </html>
    `;

    const resendApiKey = process.env.RESEND_SUPPORT_API_KEY;

    if (!resendApiKey) {
      console.warn('Support API Error: Resend credentials not configured.');
      return Response.json({
        success: false,
        error: 'Email delivery backend not configured. Please add API credentials.'
      }, { status: 500 });
    }

    const postData = JSON.stringify({
      from: 'Meter AI Support <onboarding@resend.dev>',
      to: 'support.meterai@gmail.com',
      subject: `Meter AI Support Ticket from ${email}`,
      html: emailHtml
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    await new Promise((resolve, reject) => {
      const emailReq = https.request(options, (emailRes) => {
        let responseBody = '';
        emailRes.on('data', (chunk) => {
          responseBody += chunk;
        });
        emailRes.on('end', () => {
          if (emailRes.statusCode >= 200 && emailRes.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Resend API Error (HTTP ${emailRes.statusCode}): ${responseBody}`));
          }
        });
      });
      emailReq.on('error', (err) => {
        reject(new Error('Failed to establish network connection to email delivery provider.'));
      });
      emailReq.write(postData);
      emailReq.end();
    });

    // 3. Save support ticket in PostgreSQL database table
    try {
      if (supabaseAdmin) {
        let userId = null;
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email.trim())
          .maybeSingle();
        if (profile) userId = profile.id;

        await supabaseAdmin.from('admin_support').insert({
          user_id: userId,
          user_email: email.trim(),
          user_name: (metadata && metadata.name) ? metadata.name : null,
          subject: `Meter AI Support Ticket from ${email.trim()}`,
          message: message.trim(),
          status: 'open'
        });
      }
    } catch (dbErr) {
      console.error('[Database Error] Failed to write support ticket to DB:', dbErr);
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Support Server Error:', error);
    return Response.json({
      success: false,
      error: error.message || 'An unexpected internal server error occurred.'
    }, { status: 500 });
  }
}));

// GET /api/profile - Returns user profile details securely (no auto-creation)
app.get('/api/profile', clientAuthLimiter, handleWithSupabase('user', async (req, ctx) => {
  const { data, error } = await ctx.supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', ctx.userClaims.id)
    .single();

  if (error || !data) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }

  let profile = data;

  // Auto-expiration check for Monthly Pro
  if (profile.plan === 'pro_monthly' && profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
    console.log(`[Subscription Expiry] Profile ${profile.id} has expired. Downgrading to free.`);
    const { data: updatedProfile, error: updateError } = await ctx.supabaseAdmin
      .from('profiles')
      .update({
        plan: 'free',
        subscription_status: 'expired',
        updated_at: new Date()
      })
      .eq('id', ctx.userClaims.id)
      .select()
      .single();

    if (!updateError && updatedProfile) {
      profile = updatedProfile;
    }
  }

  return Response.json({
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    plan: profile.plan,
    subscription_status: profile.subscription_status,
    premium: profile.plan === 'lifetime',
    plan_started_at: profile.plan_started_at,
    subscription_end: profile.subscription_end,
    razorpay_subscription_id: profile.razorpay_subscription_id,
    razorpay_customer_id: profile.razorpay_customer_id,
    razorpay_payment_id: profile.razorpay_payment_id
  });
}));

// POST /api/upgrade - Initiates Checkout order or subscription
app.post('/api/upgrade', clientAuthLimiter, handleWithSupabase('user', async (req, ctx) => {
  const body = await req.json();
  const { plan } = body;

  if (!plan || !['pro_monthly', 'lifetime'].includes(plan)) {
    return Response.json({ error: 'Invalid plan specified' }, { status: 400 });
  }

  // Check if user profile already exists
  const { data: profile, error } = await ctx.supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', ctx.userClaims.id)
    .single();

  if (error || !profile) {
    return Response.json({ error: 'Profile record not found. Make sure signup trigger has completed.' }, { status: 404 });
  }

  const key_id = process.env.RAZORPAY_KEY_ID;
  if (!key_id || !razorpay) {
    return Response.json({ error: 'Razorpay Key ID or secret is not configured on server.' }, { status: 500 });
  }

  if (plan === 'pro_monthly') {
    const planId = process.env.RAZORPAY_PLAN_ID;
    if (!planId) {
      return Response.json({ error: 'Monthly subscription Plan ID not configured on server.' }, { status: 500 });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: 12,
      quantity: 1,
      customer_notify: 1,
      notes: {
        userId: ctx.userClaims.id
      }
    });

    // Secure reference update in database to prevent trusting webhook data notes
    await ctx.supabaseAdmin
      .from('profiles')
      .update({
        razorpay_subscription_id: subscription.id,
        subscription_status: 'pending',
        updated_at: new Date()
      })
      .eq('id', ctx.userClaims.id);

    return Response.json({
      key_id,
      subscription_id: subscription.id
    });
  } else if (plan === 'lifetime') {
    const orderAmount = parseInt(process.env.RAZORPAY_LIFETIME_AMOUNT || '199900'); // ₹1999
    const currency = process.env.RAZORPAY_CURRENCY || 'INR';

    const order = await razorpay.orders.create({
      amount: orderAmount,
      currency,
      receipt: `rcpt_${ctx.userClaims.id.substring(0, 8)}_${Date.now()}`,
      notes: {
        userId: ctx.userClaims.id,
        plan: plan
      }
    });

    // Secure reference update in database
    await ctx.supabaseAdmin
      .from('profiles')
      .update({
        razorpay_order_id: order.id,
        subscription_status: 'pending',
        updated_at: new Date()
      })
      .eq('id', ctx.userClaims.id);

    return Response.json({
      key_id,
      order_id: order.id
    });
  }
}));

// POST /api/razorpay/verify - Verifies payment/subscription client signature and activates plan
app.post('/api/razorpay/verify', clientAuthLimiter, handleWithSupabase('user', async (req, ctx) => {
  try {
    const body = await req.json();
    const { razorpay_payment_id, razorpay_signature, razorpay_subscription_id, razorpay_order_id } = body;

    if (!razorpay_payment_id || !razorpay_signature) {
      return Response.json({ error: 'Missing payment ID or signature.' }, { status: 400 });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) {
      return Response.json({ error: 'Razorpay secret key is not configured.' }, { status: 500 });
    }

    // Check if user profile already exists
    const { data: profile, error: profileErr } = await ctx.supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', ctx.userClaims.id)
      .single();

    if (profileErr || !profile) {
      return Response.json({ error: 'Profile record not found.' }, { status: 404 });
    }

    let expectedSignature = '';
    let planToUnlock = '';
    let subscriptionEnd = null;
    let customerId = null;

    if (razorpay_subscription_id) {
      // Subscription signature verification
      const payload = `${razorpay_payment_id}|${razorpay_subscription_id}`;
      expectedSignature = crypto
        .createHmac('sha256', key_secret)
        .update(payload)
        .digest('hex');
      planToUnlock = 'pro_monthly';

      // Fetch subscription details to sync expiry date & customer_id from Razorpay
      if (razorpay) {
        try {
          const subDetails = await razorpay.subscriptions.fetch(razorpay_subscription_id);
          if (subDetails) {
            if (subDetails.current_end) {
              subscriptionEnd = new Date(subDetails.current_end * 1000);
            }
            if (subDetails.customer_id) {
              customerId = subDetails.customer_id;
            }
          }
        } catch (fetchErr) {
          console.warn('Error fetching Razorpay subscription details during verify:', fetchErr);
        }
      }
      
      // Fallback if Razorpay fetch fails/returns no current_end
      if (!subscriptionEnd) {
        subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    } else if (razorpay_order_id) {
      // Order signature verification
      const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
      expectedSignature = crypto
        .createHmac('sha256', key_secret)
        .update(payload)
        .digest('hex');
      planToUnlock = 'lifetime';

      // Additional security check: verify order belongs to this user
      if (razorpay) {
        try {
          const orderDetails = await razorpay.orders.fetch(razorpay_order_id);
          if (orderDetails) {
            if (orderDetails.notes && orderDetails.notes.userId && orderDetails.notes.userId !== ctx.userClaims.id) {
              console.warn(`[Payment verification error] Order user ID mismatch: ${orderDetails.notes.userId} !== ${ctx.userClaims.id}`);
              return Response.json({ error: 'Order user verification mismatch.' }, { status: 403 });
            }
            if (orderDetails.customer_id) {
              customerId = orderDetails.customer_id;
            }
          }
        } catch (fetchErr) {
          console.warn('Error fetching Razorpay order details during verify:', fetchErr);
        }
      }
    } else {
      return Response.json({ error: 'Missing subscription ID or order ID.' }, { status: 400 });
    }

    if (expectedSignature !== razorpay_signature) {
      console.warn('[Payment verification error] Signature mismatch.');
      return Response.json({ error: 'Payment signature verification failed.' }, { status: 400 });
    }

    // Update profile in database to active
    const updateData = {
      plan: planToUnlock,
      subscription_status: 'active',
      razorpay_payment_id,
      plan_started_at: profile.plan_started_at || new Date(),
      subscription_end: planToUnlock === 'pro_monthly' ? subscriptionEnd : null,
      updated_at: new Date()
    };

    if (razorpay_subscription_id) {
      updateData.razorpay_subscription_id = razorpay_subscription_id;
    }
    if (razorpay_order_id) {
      updateData.razorpay_order_id = razorpay_order_id;
    }
    if (customerId) {
      updateData.razorpay_customer_id = customerId;
    }

    const { error: updateError } = await ctx.supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', ctx.userClaims.id);

    if (updateError) {
      console.error('Database update error during verify:', updateError);
      return Response.json({ error: 'Failed to update database profile status.' }, { status: 500 });
    }

    // Log the verification success event to the database audit trail
    await logSubscriptionEvent(ctx.supabaseAdmin, ctx.userClaims.id, 'verification_success', razorpay_payment_id, razorpay_subscription_id);

    return Response.json({
      success: true,
      plan: planToUnlock,
      subscription_status: 'active'
    });
  } catch (err) {
    console.error('Verify endpoint exception:', err);
    return Response.json({ error: 'Internal server verification error' }, { status: 500 });
  }
}));

// POST /api/restore - REST API endpoint to restore premium features
app.post('/api/restore', clientAuthLimiter, handleWithSupabase('user', async (req, ctx) => {
  const { data, error } = await ctx.supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', ctx.userClaims.id)
    .single();

  if (error || !data) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }

  let profile = data;

  // Auto-expiration check for Monthly Pro
  if (profile.plan === 'pro_monthly' && profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
    console.log(`[Subscription Expiry] Profile ${profile.id} has expired. Downgrading to free.`);
    const { data: updatedProfile, error: updateError } = await ctx.supabaseAdmin
      .from('profiles')
      .update({
        plan: 'free',
        subscription_status: 'expired',
        updated_at: new Date()
      })
      .eq('id', ctx.userClaims.id)
      .select()
      .single();

    if (!updateError && updatedProfile) {
      profile = updatedProfile;
    }
  }

  return Response.json({
    plan: profile.plan,
    subscription_status: profile.subscription_status,
    premium: profile.plan === 'lifetime',
    plan_started_at: profile.plan_started_at,
    subscription_end: profile.subscription_end,
    razorpay_subscription_id: profile.razorpay_subscription_id,
    razorpay_customer_id: profile.razorpay_customer_id,
    razorpay_payment_id: profile.razorpay_payment_id
  });
}));

// POST /api/subscription/cancel - Cancels the active user subscription in Razorpay
app.post('/api/subscription/cancel', clientAuthLimiter, handleWithSupabase('user', async (req, ctx) => {
  try {
    const { data: profile, error } = await ctx.supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', ctx.userClaims.id)
      .single();

    if (error || !profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.plan !== 'pro_monthly' || !profile.razorpay_subscription_id) {
      return Response.json({ error: 'No active monthly subscription found to cancel.' }, { status: 400 });
    }

    if (profile.subscription_status === 'cancelled') {
      return Response.json({ error: 'Subscription is already cancelled.' }, { status: 400 });
    }

    if (!razorpay) {
      return Response.json({ error: 'Razorpay client is not configured.' }, { status: 500 });
    }

    // Cancel at the end of current cycle so that user retains access
    await razorpay.subscriptions.cancel(profile.razorpay_subscription_id, {
      cancel_at_cycle_end: 1
    });

    await ctx.supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'cancelled',
        updated_at: new Date()
      })
      .eq('id', ctx.userClaims.id);

    // Log the subscription cancellation event to the database audit trail
    await logSubscriptionEvent(ctx.supabaseAdmin, ctx.userClaims.id, 'subscription_cancelled_self', null, profile.razorpay_subscription_id);

    return Response.json({
      success: true,
      message: 'Subscription successfully cancelled. Access remains active until the end of the current billing cycle.'
    });

  } catch (err) {
    console.error('Subscription cancellation error:', err);
    return Response.json({ error: err.message || 'Failed to cancel subscription.' }, { status: 500 });
  }
}));

// POST /api/razorpay/webhook - Processes secure transaction webhook alerts
app.post('/api/razorpay/webhook', handleWithSupabase('none', async (req, ctx) => {
  try {
    const signature = req.headers.get('x-razorpay-signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      return Response.json({ error: 'Missing webhook signature or secret keys' }, { status: 400 });
    }

    const rawBodyText = await req.text();

    // Verify webhook payload integrity using HMAC-SHA256 signature validation
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBodyText)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn('[Webhook Warning] Computed signature mismatch.');
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBodyText);
    console.log(`[Webhook Event] Received: ${event.event}`);

    // Parse resource references out of verified payload
    let subId = null;
    let orderId = null;
    let paymentId = null;
    let customerId = null;

    const entity = event.payload.payment?.entity || event.payload.subscription?.entity || {};

    if (event.payload.subscription) {
      subId = event.payload.subscription.entity.id;
      customerId = event.payload.subscription.entity.customer_id;
    }
    if (event.payload.payment) {
      paymentId = event.payload.payment.entity.id;
      orderId = event.payload.payment.entity.order_id;
      customerId = customerId || event.payload.payment.entity.customer_id;
    }

    // Deduplication check: check if this payment ID has already been recorded under any user profile
    if (paymentId) {
      const { data: duplicateCheck } = await ctx.supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('razorpay_payment_id', paymentId)
        .maybeSingle();

      if (duplicateCheck) {
        console.log(`[Webhook Deduplication] paymentId ${paymentId} has already been processed. Skipping update.`);
        return Response.json({ message: 'Event already processed.' });
      }
    }

    // Cross-check profiles table to identify the matching database profile securely
    let matchingProfile = null;
    if (subId) {
      const { data } = await ctx.supabaseAdmin.from('profiles').select('*').eq('razorpay_subscription_id', subId).single();
      matchingProfile = data;
    }
    if (!matchingProfile && orderId) {
      const { data } = await ctx.supabaseAdmin.from('profiles').select('*').eq('razorpay_order_id', orderId).single();
      matchingProfile = data;
    }
    if (!matchingProfile && customerId) {
      const { data } = await ctx.supabaseAdmin.from('profiles').select('*').eq('razorpay_customer_id', customerId).single();
      matchingProfile = data;
    }
    // Webhook metadata backup fallback
    if (!matchingProfile && entity.notes?.userId) {
      const { data } = await ctx.supabaseAdmin.from('profiles').select('*').eq('id', entity.notes.userId).single();
      matchingProfile = data;
    }

    if (!matchingProfile) {
      console.warn('[Webhook Warning] Associated profile records could not be found.');
      return Response.json({ message: 'Event received, matching profile record not found.' });
    }

    const userId = matchingProfile.id;

    // Webhook event handlers
    if (event.event === 'subscription.activated' || event.event === 'subscription.charged') {
      const currentEnd = entity.current_end ? new Date(entity.current_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await ctx.supabaseAdmin
        .from('profiles')
        .update({
          plan: 'pro_monthly',
          subscription_status: 'active',
          razorpay_subscription_id: subId || matchingProfile.razorpay_subscription_id,
          razorpay_customer_id: customerId || matchingProfile.razorpay_customer_id,
          razorpay_payment_id: paymentId || matchingProfile.razorpay_payment_id,
          plan_started_at: matchingProfile.plan_started_at || new Date(),
          subscription_end: currentEnd,
          updated_at: new Date()
        })
        .eq('id', userId);
    } else if (event.event === 'payment.captured' || event.event === 'order.paid') {
      // Check if this was a lifetime order
      if (matchingProfile.razorpay_order_id === orderId || (entity.description && entity.description.includes('Lifetime'))) {
        await ctx.supabaseAdmin
          .from('profiles')
          .update({
            plan: 'lifetime',
            subscription_status: 'active',
            razorpay_order_id: orderId || matchingProfile.razorpay_order_id,
            razorpay_customer_id: customerId || matchingProfile.razorpay_customer_id,
            razorpay_payment_id: paymentId || matchingProfile.razorpay_payment_id,
            plan_started_at: matchingProfile.plan_started_at || new Date(),
            subscription_end: null, // Lifetime doesn't expire
            updated_at: new Date()
          })
          .eq('id', userId);
      }
    } else if (event.event === 'subscription.cancelled') {
      await ctx.supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'cancelled',
          updated_at: new Date()
        })
        .eq('id', userId);
    } else if (event.event === 'subscription.pending') {
      await ctx.supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'pending',
          updated_at: new Date()
        })
        .eq('id', userId);
    } else if (event.event === 'subscription.completed' || event.event === 'subscription.halted' || event.event === 'refund.processed') {
      await ctx.supabaseAdmin
        .from('profiles')
        .update({
          plan: 'free',
          subscription_status: 'expired',
          updated_at: new Date()
        })
        .eq('id', userId);
    }

    // Log the webhook event to the database audit trail
    await logSubscriptionEvent(ctx.supabaseAdmin, userId, `webhook_${event.event.replace(/\./g, '_')}`, paymentId, subId);

    return Response.json({ message: 'Webhook processed successfully.' });
  } catch (err) {
    console.error('Webhook error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}));

// ─── ADMIN DASHBOARD AUTHENTICATION MIDDLEWARES ───────────────────────
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_session;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin session missing' });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.email !== ADMIN_EMAIL || decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Session expired or invalid' });
  }
}

function requireAdminRedirect(req, res, next) {
  const token = req.cookies.admin_session;
  if (!token) {
    return res.redirect('/admin/login');
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.email !== ADMIN_EMAIL || decoded.role !== 'admin') {
      return res.redirect('/admin/login');
    }
    next();
  } catch (err) {
    return res.redirect('/admin/login');
  }
}

// ─── ADMIN AUTH ENDPOINTS ────────────────────────────────────────────

// POST /api/admin/login - Authenticate founder
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      console.warn(`[Admin Login Failure] Unauthorized email attempt: "${email}" from IP: ${clientIp}`);
      return res.status(403).json({ success: false, error: 'Access denied: Unauthorized email' });
    }

    const match = bcrypt.compareSync(password, ADMIN_PASSWORD_HASH);
    if (!match) {
      console.warn(`[Admin Login Failure] Incorrect password for email: "${email}" from IP: ${clientIp}`);
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    console.log(`[Admin Login Success] Admin authenticated successfully: "${email}" from IP: ${clientIp}`);

    // Generate JWT Session Token (valid for 24 hours)
    const token = jwt.sign(
      { email: ADMIN_EMAIL, role: 'admin' },
      ADMIN_JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set HTTP-only Cookie
    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error during login' });
  }
});

// POST /api/admin/logout - Clear session cookie
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  return res.json({ success: true });
});

// GET /api/admin/me - Verify current admin profile
app.get('/api/admin/me', requireAdmin, (req, res) => {
  return res.json({ success: true, email: req.admin.email });
});

// ─── ADMIN METRICS & DATA ENDPOINTS ──────────────────────────────────

// GET /api/admin/overview - Combined stats dashboard
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ success: false, error: 'Supabase admin client not initialized' });
    }

    // 1. Total signed up users
    const { count: totalUsers, error: uErr } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    // 2. Active Pro (lifetime + monthly)
    const { count: proUsers, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .in('plan', ['pro_monthly', 'lifetime'])
      .eq('subscription_status', 'active');

    // 3. Monthly Pro Users
    const { count: monthlyProUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'pro_monthly')
      .eq('subscription_status', 'active');

    // 4. Lifetime Users
    const { count: lifetimeUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'lifetime')
      .eq('subscription_status', 'active');

    // MRR is monthly pro users * 169
    const mrr = (monthlyProUsers || 0) * 169;

    // 5. Successful Webhook Logs
    const { count: webhookSuccessCount } = await supabaseAdmin
      .from('subscription_events')
      .select('*', { count: 'exact', head: true })
      .not('event', 'ilike', '%failed%')
      .not('event', 'ilike', '%cancelled%')
      .not('event', 'ilike', '%expired%')
      .not('event', 'ilike', '%halted%');

    // 6. Failed/Degraded Webhook Logs
    const { count: webhookErrorCount } = await supabaseAdmin
      .from('subscription_events')
      .select('*', { count: 'exact', head: true })
      .or('event.ilike.%failed%,event.ilike.%cancelled%,event.ilike.%expired%,event.ilike.%halted%');

    // 7. Recent Webhook Log Audits (last 50 for dashboard overview pagination)
    const { data: recentEvents } = await supabaseAdmin
      .from('subscription_events')
      .select('*, profiles(email)')
      .order('created_at', { ascending: false })
      .limit(50);

    // 8. Pending Support Tickets (last 50 for dashboard overview pagination)
    const { data: pendingTickets } = await supabaseAdmin
      .from('admin_support')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);

    return res.json({
      success: true,
      totalUsers: totalUsers || 0,
      proUsers: proUsers || 0,
      monthlyProUsers: monthlyProUsers || 0,
      lifetimeUsers: lifetimeUsers || 0,
      mrr,
      webhookSuccessCount: webhookSuccessCount || 0,
      webhookErrorCount: webhookErrorCount || 0,
      recentEvents: recentEvents || [],
      pendingTickets: pendingTickets || []
    });
  } catch (err) {
    console.error('Overview endpoint error:', err);
    return res.status(500).json({ success: false, error: 'Database read error' });
  }
});

// GET /api/admin/users - Retrieve user list
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', plan = 'all', status = 'all' } = req.query;

    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' });

    if (search && search.trim()) {
      const searchStr = search.trim();
      query = query.or(`email.ilike.%${searchStr}%,full_name.ilike.%${searchStr}%,id.ilike.%${searchStr}%`);
    }
    if (plan && plan !== 'all') {
      query = query.eq('plan', plan);
    }
    if (status && status !== 'all') {
      query = query.eq('subscription_status', status);
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    const { data: users, count, error } = await query;
    
    if (error) throw error;
    return res.json({
      success: true,
      users: users || [],
      count: count || 0
    });
  } catch (err) {
    console.error('Get users error:', err);
    return res.status(500).json({ success: false, error: 'Database read error' });
  }
});

// GET /api/admin/events - Retrieve webhook audit trail (last 100)
app.get('/api/admin/events', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const { data: events, count, error } = await supabaseAdmin
      .from('subscription_events')
      .select('*, profiles(email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;
    return res.json({
      success: true,
      events: events || [],
      count: count || 0
    });
  } catch (err) {
    console.error('Get events error:', err);
    return res.status(500).json({ success: false, error: 'Database read error' });
  }
});

// GET /api/admin/feedback - Retrieve user feedback
app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 5 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 5;
    const offset = (pageNum - 1) * limitNum;

    const { data: feedback, count, error } = await supabaseAdmin
      .from('admin_feedback')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;
    return res.json({
      success: true,
      feedback: feedback || [],
      count: count || 0
    });
  } catch (err) {
    console.error('Get feedback error:', err);
    return res.status(500).json({ success: false, error: 'Database read error' });
  }
});

// GET /api/admin/tickets - Retrieve support queue
app.get('/api/admin/tickets', requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 5 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 5;
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from('admin_support')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.range(offset, offset + limitNum - 1);

    const { data: tickets, count, error } = await query;
    if (error) throw error;
    return res.json({
      success: true,
      tickets: tickets || [],
      count: count || 0
    });
  } catch (err) {
    console.error('Get tickets error:', err);
    return res.status(500).json({ success: false, error: 'Database read error' });
  }
});

// POST /api/admin/ticket/status - Toggle support ticket status
app.post('/api/admin/ticket/status', requireAdmin, async (req, res) => {
  try {
    const { ticketId, status } = req.body;
    if (!ticketId || !status) {
      return res.status(400).json({ success: false, error: 'Ticket ID and status are required' });
    }

    if (!['open', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid support ticket status specified' });
    }

    const { error } = await supabaseAdmin
      .from('admin_support')
      .update({ status, updated_at: new Date() })
      .eq('id', ticketId);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('Update ticket error:', err);
    return res.status(500).json({ success: false, error: 'Database update error' });
  }
});

// POST /api/admin/ticket/reply - Send response email via Resend
app.post('/api/admin/ticket/reply', requireAdmin, async (req, res) => {
  try {
    const { ticketId, replyText } = req.body;
    if (!ticketId || !replyText || !replyText.trim()) {
      return res.status(400).json({ success: false, error: 'Ticket ID and reply message are required' });
    }

    // Fetch original ticket details
    const { data: ticket, error } = await supabaseAdmin
      .from('admin_support')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (error || !ticket) {
      return res.status(404).json({ success: false, error: 'Support ticket not found' });
    }

    const resendApiKey = process.env.RESEND_SUPPORT_API_KEY;
    if (!resendApiKey) {
      return res.status(500).json({ success: false, error: 'Resend API key not configured' });
    }

    const replySubject = ticket.subject.startsWith('Re:') ? ticket.subject : `Re: ${ticket.subject}`;
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15px; line-height: 1.6; color: #1c1c1e;">
        <p>Hi ${escapeHTML(ticket.user_name || 'there')},</p>
        <div style="margin: 20px 0; color: #1c1c1e; white-space: pre-wrap;">${escapeHTML(replyText)}</div>
        <p>Best regards,<br>Harsha Parisha<br>Founder, Meter AI</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5ea; font-size: 12px; color: #8e8e93;">
          <strong>Your Original Support Message:</strong>
          <blockquote style="margin: 10px 0 0; padding-left: 15px; border-left: 2px solid #d1d1d6; color: #8e8e93;">
            ${escapeHTML(ticket.message).replace(/\n/g, '<br>')}
          </blockquote>
        </div>
      </div>
    `;

    const postData = JSON.stringify({
      from: 'Meter AI Support <onboarding@resend.dev>',
      to: ticket.user_email,
      reply_to: 'support.meterai@gmail.com',
      subject: replySubject,
      html: emailHtml
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    await new Promise((resolve, reject) => {
      const emailReq = https.request(options, (emailRes) => {
        let responseBody = '';
        emailRes.on('data', (chunk) => { responseBody += chunk; });
        emailRes.on('end', () => {
          if (emailRes.statusCode >= 200 && emailRes.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Resend Error (HTTP ${emailRes.statusCode}): ${responseBody}`));
          }
        });
      });
      emailReq.on('error', (err) => { reject(err); });
      emailReq.write(postData);
      emailReq.end();
    });

    // Mark support ticket status as resolved after successful email reply delivery
    await supabaseAdmin
      .from('admin_support')
      .update({ status: 'resolved', updated_at: new Date() })
      .eq('id', ticketId);

    return res.json({ success: true });
  } catch (err) {
    console.error('Ticket reply error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Error delivering email response' });
  }
});

// ─── ADMIN MANAGEMENT CONTROLS ───────────────────────────────────────

// POST /api/admin/activate - Manually upgrade user plan (handles retry/pauses)
app.post('/api/admin/activate', requireAdmin, async (req, res) => {
  try {
    const { email, plan, reason } = req.body;

    if (!email || !plan) {
      return res.status(400).json({ success: false, error: 'Email and plan are required' });
    }

    if (!['pro_monthly', 'lifetime', 'free'].includes(plan)) {
      return res.status(400).json({ success: false, error: 'Invalid plan specified' });
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Invalid email address format' });
    }

    // 1. Fetch matching user profile
    const { data: user, error: uErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email.trim())
      .maybeSingle();

    if (uErr || !user) {
      return res.status(404).json({ success: false, error: 'User profile matching this email address not found.' });
    }

    // Calculate subscription end date based on Razorpay billing cycles
    let currentEnd = null;
    if (plan === 'pro_monthly') {
      currentEnd = new Date();
      currentEnd.setDate(currentEnd.getDate() + 30); // 30 days cycle
    } else if (plan === 'lifetime') {
      currentEnd = null; // lifetime doesn't expire
    }

    // 2. Update profile state
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        plan: plan,
        subscription_status: 'active',
        plan_started_at: new Date(),
        subscription_end: currentEnd,
        updated_at: new Date()
      })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    // 3. Log event into database audit trail
    await logSubscriptionEvent(supabaseAdmin, user.id, `admin_manual_activate_${plan}`, reason || 'No notes', null);

    return res.json({ success: true });
  } catch (err) {
    console.error('Manual activation error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Database update error' });
  }
});

// POST /api/admin/downgrade - Manually downgrade user to free
app.post('/api/admin/downgrade', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // 1. Fetch matching user profile
    const { data: user, error: uErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email.trim())
      .maybeSingle();

    if (uErr || !user) {
      return res.status(404).json({ success: false, error: 'User profile not found.' });
    }

    // 2. Update profile details to free
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        plan: 'free',
        subscription_status: 'expired',
        subscription_end: new Date(),
        updated_at: new Date()
      })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    // 3. Log manual downgrade event to audit trail
    await logSubscriptionEvent(supabaseAdmin, user.id, 'admin_manual_downgrade', null, null);

    return res.json({ success: true });
  } catch (err) {
    console.error('Manual downgrade error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Database update error' });
  }
});

// GET /api/admin/health - Retrieve status check on Supabase, Razorpay, Resend
app.get('/api/admin/health', requireAdmin, async (req, res) => {
  const healthData = {
    status: 'healthy',
    services: {
      supabase_rest: { status: 'unknown', latencyMs: 0 },
      supabase_db: { status: 'unknown', latencyMs: 0 },
      razorpay: { status: 'unknown', message: '' },
      resend: { status: 'unknown', message: '' }
    }
  };

  // 1. Supabase REST API check
  try {
    const start = Date.now();
    const restRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_SECRET_KEY }
    });
    healthData.services.supabase_rest.latencyMs = Date.now() - start;
    healthData.services.supabase_rest.status = restRes.ok ? 'healthy' : 'unhealthy';
  } catch (e) {
    healthData.services.supabase_rest.status = 'unhealthy';
    healthData.services.supabase_rest.message = e.message;
  }

  // 2. Supabase DB check
  try {
    const start = Date.now();
    const { data, error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    healthData.services.supabase_db.latencyMs = Date.now() - start;
    if (error) throw error;
    healthData.services.supabase_db.status = 'healthy';
  } catch (e) {
    healthData.services.supabase_db.status = 'unhealthy';
    healthData.services.supabase_db.message = e.message;
  }

  // 3. Razorpay client health
  if (razorpay) {
    healthData.services.razorpay.status = 'healthy';
    healthData.services.razorpay.message = 'Initialized (Test Mode)';
  } else {
    healthData.services.razorpay.status = 'unhealthy';
    healthData.services.razorpay.message = 'Credentials missing in environment';
  }

  // 4. Resend email config checks
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && resendKey !== 'YOUR_RESEND_API_KEY') {
    healthData.services.resend.status = 'healthy';
    healthData.services.resend.message = 'API credentials configured';
  } else {
    healthData.services.resend.status = 'unhealthy';
    healthData.services.resend.message = 'Credentials missing or default placeholder';
  }

  // Aggregate health status
  const statuses = Object.values(healthData.services).map(s => s.status);
  if (statuses.includes('unhealthy')) {
    healthData.status = 'degraded';
  }

  return res.json(healthData);
});

// POST /api/admin/sync-webhooks - Synchronize local active plan dates with DB states
app.post('/api/admin/sync-webhooks', requireAdmin, async (req, res) => {
  try {
    // Audit active plans whose current subscription ends are past current date but status is active
    const now = new Date();
    const { data: expiredProfiles, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('subscription_status', 'active')
      .lt('subscription_end', now.toISOString());

    if (error) throw error;

    let updatedCount = 0;
    if (expiredProfiles && expiredProfiles.length > 0) {
      for (const profile of expiredProfiles) {
        // Mark them as expired or trigger check
        await supabaseAdmin
          .from('profiles')
          .update({
            plan: 'free',
            subscription_status: 'expired',
            updated_at: new Date()
          })
          .eq('id', profile.id);
        
        await logSubscriptionEvent(supabaseAdmin, profile.id, 'cron_auto_expire', null, null);
        updatedCount++;
      }
    }

    return res.json({ success: true, expiredDowngradedCount: updatedCount });
  } catch (err) {
    console.error('Webhook sync/audit cron error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/revenue - Detailed payments list and MRR summaries
app.get('/api/admin/revenue', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ success: false, error: 'Database client not initialized' });
    }

    // 1. Get all events from subscription_events joining profiles
    const { data: events, error } = await supabaseAdmin
      .from('subscription_events')
      .select('*, profiles(email)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let totalRevenue = 0;
    let paymentsCount = 0;
    const paymentHistory = [];

    if (events && events.length > 0) {
      events.forEach(e => {
        let amount = 0;
        let desc = '';
        let status = 'Successful';
        let isPayment = false;

        if (e.event === 'webhook_subscription_charged') {
          amount = 169;
          desc = 'Pro Monthly Renewal';
          isPayment = true;
        } else if (e.event === 'webhook_payment_captured') {
          const userPlan = e.profiles ? e.profiles.plan : 'pro_monthly';
          if (userPlan === 'lifetime') {
            amount = 1999;
            desc = 'Lifetime Premium Purchase';
          } else {
            amount = 169;
            desc = 'Pro Monthly Purchase';
          }
          isPayment = true;
        } else if (e.event.startsWith('admin_manual_activate')) {
          amount = 0;
          desc = e.event.includes('lifetime') ? 'Lifetime (Manual Activation)' : 'Pro Monthly (Manual Activation)';
          status = 'Activated';
          isPayment = true;
        }

        if (isPayment) {
          totalRevenue += amount;
          paymentsCount++;
          paymentHistory.push({
            id: e.id,
            user_email: e.profiles ? e.profiles.email : 'Unknown User',
            description: desc,
            amount: amount,
            payment_id: e.payment_id || '—',
            status: status,
            created_at: e.created_at
          });
        }
      });
    }

    // 2. Calculate active MRR
    const { count: activeMonthlyCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'pro_monthly')
      .eq('subscription_status', 'active');
    
    const mrr = (activeMonthlyCount || 0) * 169;

    return res.json({
      success: true,
      totalRevenue,
      mrr,
      paymentsCount,
      paymentHistory
    });
  } catch (err) {
    console.error('Revenue endpoint error:', err);
    return res.status(500).json({ success: false, error: 'Database read error' });
  }
});

// GET /api/admin/notes - Get founder scratchpad notes and tasks
app.get('/api/admin/notes', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ success: false, error: 'Database client not initialized' });
    }

    // 1. Fetch note scratchpad content
    const { data: note, error: noteError } = await supabaseAdmin
      .from('admin_notes')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (noteError) throw noteError;

    // 2. Fetch all tasks from kanban_tasks table
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from('kanban_tasks')
      .select('*')
      .order('created', { ascending: true });

    if (tasksError) throw tasksError;

    return res.json({
      success: true,
      notes_content: note ? (note.notes_content || '') : '',
      tasks: tasks || []
    });
  } catch (err) {
    console.error('Get notes error:', err);
    return res.status(500).json({ success: false, error: 'Database read error' });
  }
});

// POST /api/admin/notes - Update scratchpad content
app.post('/api/admin/notes', requireAdmin, async (req, res) => {
  try {
    const { notes_content } = req.body;

    const { data: note, error } = await supabaseAdmin
      .from('admin_notes')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (note) {
      const { error: updateError } = await supabaseAdmin
        .from('admin_notes')
        .update({ notes_content, updated_at: new Date() })
        .eq('id', note.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('admin_notes')
        .insert({ notes_content, tasks_json: [] });
      if (insertError) throw insertError;
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Save notes error:', err);
    return res.status(500).json({ success: false, error: 'Database write error' });
  }
});

// POST /api/admin/tasks - Save tasks list individual rows
app.post('/api/admin/tasks', requireAdmin, async (req, res) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks)) {
      return res.status(400).json({ success: false, error: 'Tasks must be an array' });
    }

    // Validate individual tasks structure and data types
    for (const t of tasks) {
      if (t.id && typeof t.id !== 'string' && typeof t.id !== 'number') {
        return res.status(400).json({ success: false, error: 'Invalid task ID type' });
      }
      if (t.title && typeof t.title !== 'string') {
        return res.status(400).json({ success: false, error: 'Task title must be a string' });
      }
      if (t.priority && !['low', 'medium', 'high', 'critical'].includes(t.priority)) {
        return res.status(400).json({ success: false, error: `Invalid task priority: ${t.priority}` });
      }
      if (t.column && !['backlog', 'todo', 'in_progress', 'done'].includes(t.column)) {
        return res.status(400).json({ success: false, error: `Invalid task column: ${t.column}` });
      }
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ success: false, error: 'Database client not initialized' });
    }

    // 1. Fetch existing task IDs in kanban_tasks
    const { data: existingTasks, error: fetchError } = await supabaseAdmin
      .from('kanban_tasks')
      .select('id');

    if (fetchError) throw fetchError;

    const existingIds = (existingTasks || []).map(t => t.id);
    const incomingIds = tasks.map(t => t.id ? t.id.toString() : '');

    // 2. Identify removed tasks and delete them
    const toDelete = existingIds.filter(id => !incomingIds.includes(id));
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('kanban_tasks')
        .delete()
        .in('id', toDelete);

      if (deleteError) throw deleteError;
    }

    // 3. Upsert incoming tasks individually/properly
    if (tasks.length > 0) {
      const tasksToUpsert = tasks.map(t => ({
        id: t.id ? t.id.toString() : Date.now().toString(),
        title: t.title || t.text || 'Untitled Task',
        desc: t.desc || '',
        priority: t.priority || 'medium',
        column: t.column || 'backlog',
        labels: t.labels || [],
        due_date: t.due_date || null,
        completed: t.completed || (t.column === 'done'),
        created: t.created || Date.now(),
        updated: t.updated || Date.now()
      }));

      const { error: upsertError } = await supabaseAdmin
        .from('kanban_tasks')
        .upsert(tasksToUpsert);

      if (upsertError) throw upsertError;
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Save tasks error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Database write error' });
  }
});

// GET /api/admin/settings - Read masked config settings
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  try {
    const mask = (str, len = 6) => {
      if (!str) return '—';
      if (str.length <= len * 2) return '****';
      return str.substring(0, len) + '****' + str.substring(str.length - len);
    };

    const settings = {
      adminEmail: ADMIN_EMAIL,
      supabaseUrl: process.env.SUPABASE_URL || 'Not Configured',
      supabasePublishableKey: mask(process.env.SUPABASE_PUBLISHABLE_KEY, 8),
      supabaseSecretKey: mask(process.env.SUPABASE_SECRET_KEY, 6),
      razorpayKeyId: mask(process.env.RAZORPAY_KEY_ID, 6),
      razorpayPlanId: process.env.RAZORPAY_PLAN_ID || '—',
      resendConfigured: (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'YOUR_RESEND_API_KEY') ? 'Healthy (Connected)' : 'Missing API Key',
      resendSupportConfigured: (process.env.RESEND_SUPPORT_API_KEY && process.env.RESEND_SUPPORT_API_KEY !== 'YOUR_RESEND_SUPPORT_API_KEY') ? 'Healthy (Connected)' : 'Using Default Support Key',
      nodeEnv: process.env.NODE_ENV || 'development',
      jwtExpiration: '24 Hours',
      autoRefreshRate: '30 Seconds'
    };

    return res.json({ success: true, settings });
  } catch (err) {
    console.error('Get settings error:', err);
    return res.status(500).json({ success: false, error: 'Internal config error' });
  }
});

// ─── ADMIN DASHBOARD STATIC FILES SERVING ────────────────────────────
const setNoCacheHeaders = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

app.get('/admin/login', setNoCacheHeaders, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin/admin-styles.css', setNoCacheHeaders, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'admin-styles.css'));
});

app.get('/admin', requireAdminRedirect, setNoCacheHeaders, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/', requireAdminRedirect, setNoCacheHeaders, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/admin.js', requireAdminRedirect, setNoCacheHeaders, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'admin.js'));
});

// Enforce HTTPS redirect in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// ─── STATIC FILES & ROUTING FOR CLEAN URLs ──────────────────────────
const staticCacheOptions = {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    // Do not cache HTML files, robots, sitemaps, manifests, or service worker
    if (ext === '.html' || filePath.endsWith('robots.txt') || filePath.endsWith('sitemap.xml') || filePath.endsWith('manifest.json') || filePath.endsWith('manifest.webmanifest') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache for CSS, JS, images, fonts
    }
  }
};

// Serve static assets out of the root and public directory
app.use(express.static(path.join(__dirname, 'public'), staticCacheOptions));
app.use(express.static(__dirname, staticCacheOptions));

// Specific Clean URL routes
app.get('/features', (req, res) => {
  res.sendFile(path.join(__dirname, 'features.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, 'pricing.html'));
});

app.get('/install', (req, res) => {
  res.sendFile(path.join(__dirname, 'install.html'));
});

app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, 'faq.html'));
});

app.get('/changelog', (req, res) => {
  res.sendFile(path.join(__dirname, 'changelog.html'));
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'about.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'terms.html'));
});

// Route fallback for /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Default fallback to 404.html for unknown routes
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

async function migrateExistingTasks() {
  if (!supabaseAdmin) {
    console.log('⚠️ Supabase admin client not initialized. Skipping tasks migration check.');
    return;
  }
  
  try {
    // 1. Check if kanban_tasks has any entries
    const { count, error: countError } = await supabaseAdmin
      .from('kanban_tasks')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    
    if (count > 0) {
      console.log('ℹ️ kanban_tasks table already has records. Skipping migration.');
      return;
    }
    
    // 2. Fetch the serialized tasks from admin_notes
    const { data: note, error: fetchError } = await supabaseAdmin
      .from('admin_notes')
      .select('*')
      .limit(1)
      .maybeSingle();
      
    if (fetchError) throw fetchError;
    
    if (!note || !note.tasks_json || note.tasks_json.length === 0) {
      console.log('ℹ️ No existing tasks in admin_notes to migrate.');
      return;
    }
    
    console.log(`📦 Unpacking and migrating ${note.tasks_json.length} tasks from admin_notes to kanban_tasks...`);
    
    const tasksToInsert = note.tasks_json.map(t => ({
      id: t.id ? t.id.toString() : (Date.now().toString() + Math.random().toString()),
      title: t.title || t.text || 'Untitled Task',
      desc: t.desc || '',
      priority: t.priority || 'medium',
      column: t.column || 'backlog',
      labels: t.labels || [],
      due_date: t.due_date || null,
      completed: t.completed || (t.column === 'done'),
      created: t.created || Date.now(),
      updated: t.updated || Date.now()
    }));
    
    const { error: insertError } = await supabaseAdmin
      .from('kanban_tasks')
      .insert(tasksToInsert);
      
    if (insertError) throw insertError;
    
    console.log('✅ Tasks migrated successfully!');
  } catch (err) {
    console.error('❌ Error during task migration:', err.message);
  }
}

// Start Server
app.listen(PORT, async () => {
  console.log(`Meter AI server running on port ${PORT}`);
  console.log(`Landing Page: http://localhost:${PORT}`);
  console.log(`Feedback API: http://localhost:${PORT}/api/feedback`);
  console.log(`Profile API:  http://localhost:${PORT}/api/profile`);
  console.log(`Upgrade API:  http://localhost:${PORT}/api/upgrade`);
  console.log(`Restore API:  http://localhost:${PORT}/api/restore`);
  console.log(`Webhook:      http://localhost:${PORT}/api/razorpay/webhook`);
  console.log(`Supabase:     ${process.env.SUPABASE_SECRET_KEY ? 'Connected' : 'Not configured (no SUPABASE_SECRET_KEY)'}`);
  console.log(`Razorpay:     ${razorpay ? 'Connected' : 'Not configured (no RAZORPAY_KEY_ID/SECRET)'}`);
  
  // Trigger data migration
  await migrateExistingTasks();
});
