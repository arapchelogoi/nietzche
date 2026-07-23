'use strict';

// ══════════════════════════════════════════════════════
//  config.js
//  All configuration is read from environment variables.
//  In local dev: values come from .env (loaded by dotenv).
//  On Render: set these in the Environment tab — no .env needed.
// ══════════════════════════════════════════════════════

// Load .env file only in development (Render sets vars directly)
if (process.env.NODE_ENV !== 'production') {
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch {
    // dotenv not needed in production
  }
}

// ── Read & validate required variables ──
const required = ['BOT_TOKEN', 'ADMIN_CHAT_ID', 'SERVER_URL', 'SECRET_KEY'];
const missing  = required.filter(k => !process.env[k]);

if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}\n`);
  console.error('   Copy .env.example to .env and fill in your values.\n');
  process.exit(1);
}

// ── Validate SERVER_URL format ──
try {
  new URL(process.env.SERVER_URL);
} catch {
  console.error('\n❌ Invalid SERVER_URL format:', process.env.SERVER_URL);
  console.error('   Make sure it includes https://\n');
  process.exit(1);
}

const config = {
  // Telegram
  botToken:    process.env.BOT_TOKEN,
  adminChatId: process.env.ADMIN_CHAT_ID,
  tgApi:       `https://api.telegram.org/bot${process.env.BOT_TOKEN}`,

  // Server
  serverUrl:   process.env.SERVER_URL.replace(/\/$/, ''), // strip trailing slash
  appUrl:      process.env.APP_URL || '*',
  port:        parseInt(process.env.PORT || '3000', 10),
  nodeEnv:     process.env.NODE_ENV || 'development',

  // Security
  secretKey:   process.env.SECRET_KEY,

  // Token TTL — how long admin has to click a button (ms)
  tokenTtl:    parseInt(process.env.TOKEN_TTL) || 10 * 60 * 1000, // 10 minutes

  // ── OTP Settings ──
  otp: {
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS) || 120,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS) || 3,
    length: parseInt(process.env.OTP_LENGTH) || 6,
  },

  // ── Rate Limiting ──
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  // ── CORS ──
  allowedOrigins: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : [
        'https://graceful-bunny-3874aa.netlify.app',
        'https://lioninmara.onrender.com',
        'http://localhost:3000', 
        'http://localhost:5173'
      ],
};

// ── SECRET_KEY strength check ──
if (config.secretKey.length < 32) {
  console.warn('\n⚠️  WARNING: SECRET_KEY is too short (min 32 chars recommended)');
  console.warn('   Generate a strong key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
}

console.log(`\n🚀 NMB Connect Backend`);
console.log(`   Environment: ${config.nodeEnv}`);
console.log(`   Server URL: ${config.serverUrl}`);
console.log(`   Port: ${config.port}\n`);

export default Object.freeze(config);
