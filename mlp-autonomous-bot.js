require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const { NodeSSH } = require('node-ssh');
const axios = require('axios');

// === CONFIGURATION ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const OWNER_CHAT_ID = "2036865681"; // Your ID

// IONOS VPS DETAILS
const VPS_CONFIG = {
  host: '74.208.250.231', // Your IONOS IP
  username: 'root',
  password: process.env.VPS_SSH_PASS || '0UuBz2Fz' // Priority to ENV
};

// === INITIALIZATION ===
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const ssh = new NodeSSH();
const anthropic = CLAUDE_API_KEY ? new Anthropic({ apiKey: CLAUDE_API_KEY }) : null;

let monitoringActive = false;

console.log('🤖 MLP Autonomous Bot: IONOS-READY VERSION STARTING...');

// === VPS REMOTE COMMAND EXECUTION ===
async function executeOnVPS(command) {
  try {
    await ssh.connect(VPS_CONFIG);
    const result = await ssh.execCommand(command, { cwd: '/root/mylangpartv2' });
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    ssh.dispose();
  }
}

// === AI ORCHESTRATOR (Multi-Provider Fallback) ===
async function callAI(prompt) {
  // Try Claude (Premium), then Gemini (Free), then Kimi (Free)
  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });
      return { text: response.content[0].text, provider: 'Claude' };
    } catch (e) { console.log("Claude failed, trying Gemini..."); }
  }

  if (GEMINI_API_KEY) {
    try {
      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
        contents: [{ parts: [{ text: prompt }] }]
      });
      return { text: response.data.candidates[0].content.parts[0].text, provider: 'Gemini' };
    } catch (e) { console.log("Gemini failed, trying Kimi..."); }
  }

  return { text: "Basic AI mode: I can hear you but my high-level logic is offline.", provider: 'Basic' };
}

// === TELEGRAM COMMANDS ===
bot.onText(/\/start/, (msg) => {
  const welcome = `🤖 *MLP IONOS VPS BOT ACTIVE*\n\n` +
    `Connected to: ${VPS_CONFIG.host}\n` +
    `Status: Waiting for commands\n\n` +
    `Use /status to check the app or /deploy to push code to the VPS.`;
  bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, async (msg) => {
  bot.sendMessage(msg.chat.id, "🔍 Checking App & VPS Status...");
  try {
    const health = await axios.get('https://app.mylanguagepartner.com', { timeout: 5000 }).catch(e => e.response);
    const vpsCheck = await executeOnVPS('pm2 list');
    
    const report = `📊 *Status Report*\n\n` +
      `🌐 *App:* ${health?.status === 200 ? '✅ ONLINE' : '❌ DOWN'}\n` +
      `🖥️ *VPS:* ${vpsCheck.success ? '✅ CONNECTED' : '❌ SSH FAILED'}\n` +
      `🤖 *PM2:* \n\`\`\`${vpsCheck.stdout || 'N/A'}\`\`\``;
    
    bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(msg.chat.id, "Error: " + err.message);
  }
});

bot.onText(/\/deploy/, async (msg) => {
  bot.sendMessage(msg.chat.id, "🚀 *Starting IONOS VPS Deployment...*", { parse_mode: 'Markdown' });
  
  const commands = [
    'git pull origin main',
    'npm install',
    'pm2 restart all'
  ];

  for (const cmd of commands) {
    const res = await executeOnVPS(cmd);
    if (!res.success) {
      return bot.sendMessage(msg.chat.id, `❌ *Failed at:* ${cmd}\nError: ${res.error}`, { parse_mode: 'Markdown' });
    }
  }

  bot.sendMessage(msg.chat.id, "✅ *Deployment to IONOS Complete!*", { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
  if (msg.text.startsWith('/')) return;
  const result = await callAI(`User is asking: ${msg.text}. Help them manage their IONOS VPS bot.`);
  bot.sendMessage(msg.chat.id, `${result.text}\n\n_via ${result.provider}_`);
});

bot.on('polling_error', console.error);
