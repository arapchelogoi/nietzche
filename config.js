'use strict';

// ══════════════════════════════════════════════════════
//  config.js
//  All configuration is read from environment variables.
// ══════════════════════════════════════════════════════

if (process.env.NODE_ENV !== 'production') {
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch {
    // dotenv not needed in production
  }
}

const required = ['BOT_TOKEN', 'ADMIN_CHAT_ID', 'SERVER_URL', 'SECRET_KEY'];
const missing  = required.filter(k => !process.env[k]);

if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}\n`);
  process.exit(1);
}

try {
  new URL(process.env.SERVER_URL);
} catch {
  console.error('\n❌ Invalid SERVER_URL format:', process.env.SERVER_URL);
  process.exit(1);
}

const config = {
  botToken:    process.env.BOT_TOKEN,
  adminChatId: process.env.ADMIN_CHAT_ID,
  tgApi:       `https://api.telegram.org/bot${process.env.BOT_TOKEN}`,
  serverUrl:   process.env.SERVER_URL.replace(/\/$/, ''),
  appUrl:      process.env.APP_URL || '*',
  port:        parseInt(process.env.PORT || '3000', 10),
  nodeEnv:     process.env.NODE_ENV || 'development',
  secretKey:   process.env.SECRET_KEY,
  tokenTtl:    parseInt(process.env.TOKEN_TTL) || 10 * 60 * 1000,

  otp: {
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS) || 120,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS) || 3,
    length: parseInt(process.env.OTP_LENGTH) || 6,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  allowedOrigins: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : [
        'https://nmbza.netlify.app',           // ← NEW Netlify URL
        'https://bluebird-bvkt.onrender.com',  // ← Your Render URL
        'http://localhost:3000',
        'http://localhost:5173'
      ],
};

if (config.secretKey.length < 32) {
  console.warn('\n⚠️  WARNING: SECRET_KEY is too short (min 32 chars recommended)');
}

console.log(`\n🚀 NMB Connect Backend`);
console.log(`   Environment: ${config.nodeEnv}`);
console.log(`   Server URL: ${config.serverUrl}`);
console.log(`   Port: ${config.port}\n`);

export default Object.freeze(config);
