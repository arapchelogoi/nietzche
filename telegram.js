'use strict';

// ══════════════════════════════════════════════════════
//  telegram.js
//  Wrapper around the Telegram Bot API.
//  Handles sending admin notifications for
//  NMB Connect loan application approvals.
// ══════════════════════════════════════════════════════

import fetch from 'node-fetch';
import config from './config.js';

const MAX_RETRIES = 3;
const TIMEOUT = 10000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
export function escMd(text) {
  if (!text) return '';
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Make a Telegram Bot API request with retry logic
 */
export async function tgRequest(method, params, retries = MAX_RETRIES) {
  const url = `${config.tgApi}/${method}`;
  
  if (!config.botToken) {
    console.error('❌ Bot token is missing');
    return { ok: false, description: 'Bot token not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!data.ok) {
      console.error(`❌ Telegram API error (${method}):`, data.description);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`❌ Telegram API timeout (${method})`);
      return { ok: false, description: 'Request timeout' };
    }

    console.error(`❌ Telegram API error (${method}):`, error.message);

    if (retries > 0) {
      console.log(`🔄 Retrying ${method} (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})...`);
      await sleep(1000);
      return tgRequest(method, params, retries - 1);
    }

    return { ok: false, description: error.message };
  }
}

/**
 * Send a message to the admin with inline keyboard buttons
 */
export async function sendAdminMessage(text, keyboard) {
  if (!config.adminChatId) {
    console.error('❌ Admin chat ID is not configured');
    return { ok: false, description: 'Admin chat ID not configured' };
  }

  return tgRequest('sendMessage', {
    chat_id: config.adminChatId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: keyboard && keyboard.length > 0
      ? JSON.stringify({ inline_keyboard: keyboard })
      : undefined,
  });
}

/**
 * Remove buttons from a message while keeping the text intact
 */
export async function removeButtons(chatId, messageId) {
  return tgRequest('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: JSON.stringify({ inline_keyboard: [] }),
  });
}

/**
 * Answer a callback query (removes the spinner on the button)
 */
export async function answerCallback(callbackQueryId, text, showAlert = false) {
  if (!callbackQueryId) {
    console.error('❌ Missing callback query ID');
    return { ok: false, description: 'Missing callback query ID' };
  }

  return tgRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || '✅ Done',
    show_alert: showAlert || false,
  });
}

/**
 * Register this server as the webhook with Telegram
 */
export async function registerWebhook() {
  const webhookUrl = `${config.serverUrl}/webhook`;
  console.log(`🔗 Registering webhook: ${webhookUrl}`);

  const result = await tgRequest('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['callback_query', 'message'],
    drop_pending_updates: true,
  });

  if (result.ok) {
    console.log('✅ Webhook registered successfully');
  } else {
    console.error('❌ Webhook registration failed:', result.description);
  }

  return result;
}

export default {
  tgRequest,
  sendAdminMessage,
  removeButtons,
  answerCallback,
  registerWebhook,
  escMd,
};
