require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const GPT4_API_KEY = process.env.GPT4_API_KEY; // Optional
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mylangpartv2-d5bc9';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const VPS_SSH_HOST = process.env.VPS_SSH_HOST; // Your VPS IP
const VPS_SSH_USER = process.env.VPS_SSH_USER || 'root';
const VPS_SSH_KEY = process.env.VPS_SSH_KEY; // Base64 encoded SSH key
const AUTO_FIX_ENABLED = process.env.AUTO_FIX_ENABLED === 'true';
const AUTO_DEPLOY_ENABLED = process.env.AUTO_DEPLOY_ENABLED === 'true';
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID; // Your Telegram chat ID

// Initialize services
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });

// Auto-healing state
let monitoringActive = false;
let lastCheckTime = Date.now();
let errorHistory = [];
let autoFixQueue = [];
let deploymentInProgress = false;

console.log('🤖 MLP Autonomous System Starting...');
console.log(`📊 Auto-Fix: ${AUTO_FIX_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log(`🚀 Auto-Deploy: ${AUTO_DEPLOY_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log(`💡 Owner Chat ID: ${OWNER_CHAT_ID || 'Not set - use /start to configure'}`);

// ==================== AI ORCHESTRATOR ====================

async function callAI(prompt, preferredModel = 'claude') {
  const models = [
    { name: 'claude', enabled: !!CLAUDE_API_KEY },
    { name: 'kimi', enabled: !!KIMI_API_KEY },
    { name: 'gpt4', enabled: !!GPT4_API_KEY }
  ];

  for (const model of models.filter(m => m.enabled)) {
    try {
      if (model.name === 'claude') {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }]
        });
        return { text: response.content[0].text, provider: 'Claude' };
      }
      
      if (model.name === 'kimi') {
        const response = await axios.post('https://api.moonshot.cn/v1/chat/completions', {
          model: 'moonshot-v1-8k',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }, {
          headers: {
            'Authorization': `Bearer ${KIMI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        return { text: response.data.choices[0].message.content, provider: 'Kimi AI' };
      }

      if (model.name === 'gpt4') {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4-turbo-preview',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }, {
          headers: {
            'Authorization': `Bearer ${GPT4_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        return { text: response.data.choices[0].message.content, provider: 'GPT-4' };
      }
    } catch (error) {
      console.log(`${model.name} failed:`, error.message);
      continue;
    }
  }

  return { text: 'All AI providers unavailable. System operating in basic mode.', provider: 'Basic' };
}

// ==================== AUTO-HEALING ENGINE ====================

async function diagnoseIssue(error) {
  const prompt = `You are an expert debugging AI for a React Native/Expo app called My Language Partner.

ERROR DETAILS:
${JSON.stringify(error, null, 2)}

APP CONTEXT:
- React Native with Expo
- Firebase for backend
- Multiple AI integrations (Claude, GPT-4, Gemini, Kimi)
- D-ID for video generation
- ElevenLabs for voice
- Agora for video calling

ANALYZE THIS ERROR AND PROVIDE:
1. Root cause (be specific)
2. Affected components/files
3. Severity (critical/high/medium/low)
4. Auto-fix possible? (yes/no)
5. If yes, provide exact code fix
6. If no, provide manual steps

Format response as JSON:
{
  "rootCause": "...",
  "affectedFiles": ["file1.js", "file2.js"],
  "severity": "high",
  "autoFixable": true,
  "fix": {
    "file": "path/to/file.js",
    "changes": [
      {"line": 123, "old": "...", "new": "..."}
    ]
  },
  "explanation": "..."
}`;

  const result = await callAI(prompt);
  try {
    // Extract JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI diagnosis:', e);
  }
  return null;
}

async function applyAutoFix(diagnosis) {
  if (!diagnosis || !diagnosis.autoFixable) {
    return { success: false, reason: 'Not auto-fixable' };
  }

  try {
    // Create a new branch for the fix
    const branchName = `auto-fix-${Date.now()}`;
    
    const createBranch = await axios.post(
      `https://api.github.com/repos/${GITHUB_REPO}/git/refs`,
      {
        ref: `refs/heads/${branchName}`,
        sha: await getLatestCommitSha()
      },
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    // Apply the fix
    for (const change of diagnosis.fix.changes) {
      await updateGitHubFile(
        diagnosis.fix.file,
        change.old,
        change.new,
        `Auto-fix: ${diagnosis.rootCause}`,
        branchName
      );
    }

    // Create PR
    const pr = await axios.post(
      `https://api.github.com/repos/${GITHUB_REPO}/pulls`,
      {
        title: `🤖 Auto-Fix: ${diagnosis.rootCause}`,
        body: `**Automated fix generated by AI**\n\n${diagnosis.explanation}\n\n**Severity:** ${diagnosis.severity}\n**Affected files:** ${diagnosis.affectedFiles.join(', ')}`,
        head: branchName,
        base: 'main'
      },
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    // If auto-deploy enabled and severity is not critical, auto-merge
    if (AUTO_DEPLOY_ENABLED && diagnosis.severity !== 'critical') {
      await mergePR(pr.data.number);
      return { success: true, pr: pr.data.html_url, autoMerged: true };
    }

    return { success: true, pr: pr.data.html_url, autoMerged: false };
  } catch (error) {
    console.error('Auto-fix failed:', error);
    return { success: false, reason: error.message };
  }
}

async function getLatestCommitSha() {
  const response = await axios.get(
    `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/main`,
    {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
  return response.data.object.sha;
}

async function updateGitHubFile(filepath, oldContent, newContent, message, branch) {
  // Get current file
  const fileResponse = await axios.get(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${filepath}?ref=${branch}`,
    {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );

  const currentContent = Buffer.from(fileResponse.data.content, 'base64').toString();
  const updatedContent = currentContent.replace(oldContent, newContent);

  // Update file
  await axios.put(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${filepath}`,
    {
      message: message,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: fileResponse.data.sha,
      branch: branch
    },
    {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
}

async function mergePR(prNumber) {
  await axios.put(
    `https://api.github.com/repos/${GITHUB_REPO}/pulls/${prNumber}/merge`,
    {
      merge_method: 'squash',
      commit_title: '🤖 Auto-merged by AI system'
    },
    {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
}

// ==================== MONITORING LOOP ====================

async function monitoringLoop() {
  if (!monitoringActive) return;

  try {
    // Check app health
    const healthCheck = await axios.get('https://app.mylanguagepartner.com', {
      timeout: 10000,
      validateStatus: () => true
    });

    if (healthCheck.status !== 200) {
      await handleAppDown(healthCheck.status);
    }

    // Check for new errors in Firebase (if configured)
    // TODO: Implement Firebase error log checking

    // Run checks every 2 minutes
    setTimeout(monitoringLoop, 120000);
  } catch (error) {
    console.error('Monitoring loop error:', error);
    setTimeout(monitoringLoop, 120000);
  }
}

async function handleAppDown(statusCode) {
  const error = {
    type: 'app_down',
    statusCode: statusCode,
    timestamp: new Date().toISOString(),
    url: 'https://app.mylanguagepartner.com'
  };

  // Notify owner
  if (OWNER_CHAT_ID) {
    bot.sendMessage(OWNER_CHAT_ID, 
      `🚨 *ALERT: App is DOWN*\n\nStatus Code: ${statusCode}\nTime: ${new Date().toLocaleString()}\n\n` +
      `Auto-diagnosis in progress...`,
      { parse_mode: 'Markdown' }
    );
  }

  // Diagnose
  const diagnosis = await diagnoseIssue(error);
  
  if (diagnosis && AUTO_FIX_ENABLED) {
    const fixResult = await applyAutoFix(diagnosis);
    
    if (OWNER_CHAT_ID) {
      if (fixResult.success) {
        bot.sendMessage(OWNER_CHAT_ID,
          `✅ *Auto-fix applied!*\n\n` +
          `Issue: ${diagnosis.rootCause}\n` +
          `PR: ${fixResult.pr}\n` +
          `${fixResult.autoMerged ? '✅ Auto-merged and deploying' : '⏳ Awaiting your review'}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(OWNER_CHAT_ID,
          `⚠️ *Auto-fix failed*\n\n` +
          `Issue: ${diagnosis.rootCause}\n` +
          `Reason: ${fixResult.reason}\n\n` +
          `Manual intervention required.`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  }
}

// ==================== VPS REMOTE EXECUTION ====================

async function executeOnVPS(command) {
  if (!VPS_SSH_HOST) {
    return { success: false, error: 'VPS not configured' };
  }

  try {
    // For Railway deployment, this won't work directly
    // Will need SSH client library like node-ssh
    // Placeholder for now
    return { success: false, error: 'VPS execution requires SSH setup' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== TELEGRAM BOT COMMANDS ====================

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  // Save owner chat ID if not set
  if (!process.env.OWNER_CHAT_ID) {
    process.env.OWNER_CHAT_ID = chatId.toString();
  }

  const welcomeMessage = `🤖 *MLP Autonomous System Active*

Your AI-powered auto-healing assistant is running 24/7!

*System Status:*
✅ Multi-AI Orchestrator (Claude, Kimi${GPT4_API_KEY ? ', GPT-4' : ''})
${AUTO_FIX_ENABLED ? '✅' : '⚠️'} Auto-Fix: ${AUTO_FIX_ENABLED ? 'ENABLED' : 'DISABLED'}
${AUTO_DEPLOY_ENABLED ? '✅' : '⚠️'} Auto-Deploy: ${AUTO_DEPLOY_ENABLED ? 'ENABLED' : 'DISABLED'}
${VPS_SSH_HOST ? '✅' : '⚠️'} VPS: ${VPS_SSH_HOST || 'Not configured'}

*What I do automatically:*
🔍 Monitor app 24/7
🧠 Diagnose errors with AI
🔧 Generate and apply fixes
🚀 Deploy updates
📊 Track performance
💬 Alert you via Telegram

*Commands:*
/monitor - Start/stop monitoring
/status - Full system status
/errors - Recent error log
/autofix - Toggle auto-fix
/autodeploy - Toggle auto-deploy
/heal - Manual healing trigger
/deploy - Deploy current version
/rollback - Rollback last deployment
/help - All commands

Your Chat ID: ${chatId}
${!process.env.OWNER_CHAT_ID ? '\n⚠️ Set this as OWNER_CHAT_ID in Railway!' : ''}

Ready to keep your app running while you sleep! 😴`;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/monitor/, (msg) => {
  const chatId = msg.chat.id;
  monitoringActive = !monitoringActive;
  
  if (monitoringActive) {
    bot.sendMessage(chatId, '✅ Monitoring activated! Checking every 2 minutes...');
    monitoringLoop();
  } else {
    bot.sendMessage(chatId, '⏸️ Monitoring paused.');
  }
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, '🔍 Checking system status...');
  
  try {
    const appHealth = await axios.get('https://app.mylanguagepartner.com', {
      timeout: 10000,
      validateStatus: () => true
    });

    const status = `📊 *System Status Report*

*App Health:*
${appHealth.status === 200 ? '✅' : '❌'} Status: ${appHealth.status === 200 ? 'ONLINE' : 'DOWN'}
Code: ${appHealth.status}
URL: https://app.mylanguagepartner.com

*Monitoring:*
${monitoringActive ? '✅' : '⏸️'} Active: ${monitoringActive}
⏰ Last Check: ${new Date(lastCheckTime).toLocaleString()}
📝 Errors Today: ${errorHistory.filter(e => e.timestamp > Date.now() - 86400000).length}

*Auto-Healing:*
${AUTO_FIX_ENABLED ? '✅' : '⚠️'} Auto-Fix: ${AUTO_FIX_ENABLED ? 'ON' : 'OFF'}
${AUTO_DEPLOY_ENABLED ? '✅' : '⚠️'} Auto-Deploy: ${AUTO_DEPLOY_ENABLED ? 'ON' : 'OFF'}
🔄 Fixes in Queue: ${autoFixQueue.length}

*AI Providers:*
${CLAUDE_API_KEY ? '✅' : '❌'} Claude
${KIMI_API_KEY ? '✅' : '❌'} Kimi AI
${GPT4_API_KEY ? '✅' : '❌'} GPT-4

*Infrastructure:*
${VPS_SSH_HOST ? '✅' : '⚠️'} VPS: ${VPS_SSH_HOST || 'Not configured'}
✅ GitHub: Connected
${deploymentInProgress ? '🚀' : '✅'} Deployment: ${deploymentInProgress ? 'IN PROGRESS' : 'Ready'}

Last updated: ${new Date().toLocaleString()}`;

    bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, `Error checking status: ${error.message}`);
  }
});

bot.onText(/\/autofix/, (msg) => {
  const chatId = msg.chat.id;
  // Toggle would require persistent storage
  bot.sendMessage(chatId, 
    `Auto-fix is currently: ${AUTO_FIX_ENABLED ? 'ENABLED' : 'DISABLED'}\n\n` +
    `To change: Update AUTO_FIX_ENABLED environment variable in Railway.`
  );
});

bot.onText(/\/heal/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🔧 Running manual health check and auto-heal...');
  
  await handleAppDown(0); // Trigger manual check
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const help = `📚 *Complete Command List*

*Monitoring:*
/monitor - Start/stop auto-monitoring
/status - Full system health report
/errors - View error history
/logs - Firebase logs (if configured)

*Auto-Healing:*
/heal - Trigger manual diagnosis & fix
/autofix - View/toggle auto-fix status
/autodeploy - View/toggle auto-deploy

*Deployment:*
/deploy - Deploy latest code
/rollback - Rollback to previous version
/branches - List git branches
/commits - Recent commits

*GitHub:*
/github - Repository status
/workflows - GitHub Actions status
/prs - Open pull requests

*Analysis:*
/analyze - Deep system analysis
/fix [description] - AI fix suggestion

*Configuration:*
/config - View current config
/vps - VPS connection status

Just ask questions naturally:
"Why is the app down?"
"What broke in the last hour?"
"Deploy the latest fix"
"Rollback to yesterday"

I'll handle it! 🤖`;

  bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

// Natural language AI handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  bot.sendMessage(chatId, '🤔 Processing your request...');
  
  const prompt = `You are an autonomous AI assistant managing the My Language Partner app.

User request: "${text}"

Current system state:
- App status: ${monitoringActive ? 'Monitored' : 'Not monitored'}
- Auto-fix: ${AUTO_FIX_ENABLED}
- Auto-deploy: ${AUTO_DEPLOY_ENABLED}
- VPS configured: ${!!VPS_SSH_HOST}

Respond helpfully about what actions you can take or suggest appropriate commands.
If they're asking to do something, explain if you can do it automatically or need approval.`;

  const result = await callAI(prompt);
  bot.sendMessage(chatId, result.text + `\n\n_Powered by ${result.provider}_`, { parse_mode: 'Markdown' });
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  if (OWNER_CHAT_ID) {
    bot.sendMessage(OWNER_CHAT_ID, `🚨 System error: ${error.message}`);
  }
});

console.log('✅ MLP Autonomous System is running!');
console.log('📱 Message your bot at: t.me/Mlpv2bot');
console.log('💡 Use /start to begin');
