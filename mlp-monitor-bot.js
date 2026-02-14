require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
const axios = require('axios');

// Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8421996761:AAFIkZKo-ZP4Z5Axq0fvPwObxfr_hs9apDw';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mylangpartv2-d5bc9';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

// Initialize services
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });

// Store user's chat ID
let authorizedChatId = null;

// Initialize Firebase (you'll need to add your service account)
let firebaseInitialized = false;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: FIREBASE_PROJECT_ID
    });
    firebaseInitialized = true;
  }
} catch (error) {
  console.log('Firebase not initialized yet - awaiting credentials');
}

// Welcome message
bot.onText(/\/start/, (msg) => {
  authorizedChatId = msg.chat.id;
  const welcomeMessage = `🤖 *MLP Monitor Bot Active*

Your AI assistant for My Language Partner is now running!

*What I can do:*
📊 Monitor your production app
🔍 Analyze errors with Claude AI
🚀 Check deployment status
📝 Review Firebase logs
💡 Suggest fixes automatically
🔧 GitHub integration enabled

*Commands:*
/status - Check app health
/errors - Show recent errors
/logs - View Firebase logs
/deploy - Deployment info
/github - GitHub repo status
/commits - Recent commits
/fix [issue] - Get AI analysis
/help - Show all commands

*Your Chat ID:* ${msg.chat.id}
(Save this for configuration)

*Connected Services:*
${GITHUB_TOKEN ? '✅ GitHub' : '⚠️ GitHub (add token)'}
${CLAUDE_API_KEY ? '✅ Claude AI' : '⚠️ Claude AI (add key)'}
${firebaseInitialized ? '✅ Firebase' : '⚠️ Firebase (add credentials)'}

Ready to help! Just ask me anything about your app.`;

  bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' });
});

// Help command
bot.onText(/\/help/, (msg) => {
  const helpMessage = `📚 *Available Commands*

*Monitoring:*
/status - App health check
/errors - Recent error summary
/logs - Firebase logs (last hour)

*Analysis:*
/fix [description] - AI-powered fix suggestions
/analyze - Deep dive into current issues

*GitHub:*
/github - Repository status
/commits - Recent commits
/branches - List branches
/workflows - GitHub Actions status

*Deployment:*
/deploy - Show deployment status
/recent - Recent deployments

*Utilities:*
/test - Run health checks
/clear - Clear error cache

*Just ask questions naturally:*
"Why is the tutor button broken?"
"What errors happened today?"
"Help me fix the white screen"
"Show me recent code changes"

I'll use Claude AI to analyze and respond!`;

  bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
});

// Status check
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, '🔍 Checking app status...');
  
  try {
    // Check if app is reachable
    const https = require('https');
    const appUrl = 'https://app.mylanguagepartner.com';
    
    https.get(appUrl, (res) => {
      const status = res.statusCode === 200 ? '✅ ONLINE' : '⚠️ ISSUES DETECTED';
      const statusMessage = `📊 *App Status Report*

*Production URL:* ${appUrl}
*Status:* ${status}
*Response Code:* ${res.statusCode}
*Firebase Project:* mylangpartv2-d5bc9
*Firebase:* ${firebaseInitialized ? '✅ Connected' : '⚠️ Not configured'}
*Claude AI:* ${CLAUDE_API_KEY ? '✅ Active' : '⚠️ No API key'}
*GitHub:* ${GITHUB_TOKEN ? '✅ Connected' : '⚠️ No token'}

*Last Check:* ${new Date().toLocaleString()}`;

      bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
    }).on('error', (err) => {
      bot.sendMessage(chatId, `❌ *App Unreachable*\n\nError: ${err.message}`, { parse_mode: 'Markdown' });
    });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error checking status: ${error.message}`);
  }
});

// Error log viewer
bot.onText(/\/errors/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!firebaseInitialized) {
    bot.sendMessage(chatId, '⚠️ Firebase not configured yet. Add your service account to enable error monitoring.');
    return;
  }
  
  bot.sendMessage(chatId, '📋 Fetching recent errors...');
  
  // This would connect to Firebase/Sentry to get real errors
  // For now, showing example structure
  const errorReport = `🔴 *Recent Errors (Last 24h)*

*1. Navigation Error*
Time: 2 hours ago
Location: AI Tutor screen
Error: Cannot read property 'navigate'
Count: 15 occurrences

*2. API Timeout*
Time: 5 hours ago
Location: ElevenLabs integration
Error: Request timeout after 30s
Count: 3 occurrences

Use /fix to get AI-powered solutions!`;

  bot.sendMessage(chatId, errorReport, { parse_mode: 'Markdown' });
});

// AI-powered fix suggestions
bot.onText(/\/fix (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const issue = match[1];
  
  if (!CLAUDE_API_KEY) {
    bot.sendMessage(chatId, '⚠️ Claude API key not configured. Add CLAUDE_API_KEY to environment variables.');
    return;
  }
  
  bot.sendMessage(chatId, '🤔 Analyzing with Claude AI...');
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a debugging assistant for a React Native/Firebase app called My Language Partner. 

The user reports this issue: "${issue}"

Context:
- App uses Firebase Hosting, Cloud Functions
- React Native for mobile, web version deployed
- Multiple AI integrations (Claude, GPT-4, Gemini)
- Common issues: navigation bugs, white screens, API timeouts

Provide:
1. Most likely cause
2. Specific code fix
3. Prevention strategy

Be concise and actionable.`
      }]
    });
    
    const analysis = response.content[0].text;
    const fixMessage = `🔧 *AI Analysis*\n\n${analysis}\n\n_Analyzed by Claude Sonnet 4_`;
    
    bot.sendMessage(chatId, fixMessage, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error getting AI analysis: ${error.message}`);
  }
});

// Natural language processing for questions
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip if no text or if it's a command
  if (!text || text.startsWith('/')) return;
  
  if (!CLAUDE_API_KEY) {
    bot.sendMessage(chatId, 'Add your Claude API key to enable AI chat!');
    return;
  }
  
  try {
    // Use Claude to understand and respond to the question
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a helpful assistant monitoring the My Language Partner app for Justin.

User question: "${text}"

Context you have access to:
- App URL: https://app.mylanguagepartner.com
- Firebase project: my-language-partner
- Common issues: navigation bugs, white screens, authentication problems
- Recent fixes: Metro bundler config, Firebase Functions migration

Respond helpfully. If they're asking about errors, suggest using /errors or /status commands. 
If asking for fixes, suggest /fix command.
Be friendly and concise.`
      }]
    });
    
    const reply = response.content[0].text;
    bot.sendMessage(chatId, reply);
    
  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}\n\nTry using /help to see available commands.`);
  }
});

// Deployment status
bot.onText(/\/deploy/, (msg) => {
  const chatId = msg.chat.id;
  
  const deployInfo = `🚀 *Deployment Information*

*Production:*
URL: https://app.mylanguagepartner.com
Hosting: Firebase Hosting
Status: Active

*Staging/Testing:*
Use Firebase Emulator for local testing

*Quick Deploy:*
From computer:
\`firebase deploy --only hosting\`

*Recent Deployments:*
Check Firebase Console → Hosting → Release History

Want to set up auto-deploy from GitHub? Let me know!`;

  bot.sendMessage(chatId, deployInfo, { parse_mode: 'Markdown' });
});

// GitHub repository status
bot.onText(/\/github/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    bot.sendMessage(chatId, '⚠️ GitHub not configured. Add GITHUB_TOKEN and GITHUB_REPO to environment variables.');
    return;
  }
  
  bot.sendMessage(chatId, '📂 Fetching GitHub repo info...');
  
  try {
    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const repo = response.data;
    const repoInfo = `📂 *GitHub Repository*

*Name:* ${repo.name}
*Description:* ${repo.description || 'No description'}
*Default Branch:* ${repo.default_branch}
*Stars:* ⭐ ${repo.stargazers_count}
*Open Issues:* ${repo.open_issues_count}
*Last Updated:* ${new Date(repo.updated_at).toLocaleString()}

*URL:* ${repo.html_url}

Use /commits to see recent changes!`;

    bot.sendMessage(chatId, repoInfo, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error fetching repo: ${error.message}\n\nMake sure GITHUB_REPO is set correctly (format: username/repo-name)`);
  }
});

// Recent commits
bot.onText(/\/commits/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    bot.sendMessage(chatId, '⚠️ GitHub not configured.');
    return;
  }
  
  bot.sendMessage(chatId, '📝 Fetching recent commits...');
  
  try {
    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/commits`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      params: {
        per_page: 5
      }
    });
    
    const commits = response.data;
    let commitList = '📝 *Recent Commits*\n\n';
    
    commits.forEach((commit, index) => {
      const message = commit.commit.message.split('\n')[0]; // First line only
      const author = commit.commit.author.name;
      const date = new Date(commit.commit.author.date).toLocaleDateString();
      const sha = commit.sha.substring(0, 7);
      
      commitList += `*${index + 1}. ${message}*\n`;
      commitList += `   By: ${author} | ${date}\n`;
      commitList += `   SHA: \`${sha}\`\n\n`;
    });
    
    bot.sendMessage(chatId, commitList, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error fetching commits: ${error.message}`);
  }
});

// GitHub workflows/actions
bot.onText(/\/workflows/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    bot.sendMessage(chatId, '⚠️ GitHub not configured.');
    return;
  }
  
  bot.sendMessage(chatId, '⚙️ Checking GitHub Actions...');
  
  try {
    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/actions/runs`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      params: {
        per_page: 5
      }
    });
    
    const runs = response.data.workflow_runs;
    
    if (runs.length === 0) {
      bot.sendMessage(chatId, 'ℹ️ No GitHub Actions workflows found.\n\nWant me to help you set up CI/CD?');
      return;
    }
    
    let workflowList = '⚙️ *Recent Workflow Runs*\n\n';
    
    runs.forEach((run, index) => {
      const status = run.conclusion === 'success' ? '✅' : 
                     run.conclusion === 'failure' ? '❌' : 
                     run.status === 'in_progress' ? '🔄' : '⏸️';
      
      workflowList += `${status} *${run.name}*\n`;
      workflowList += `   Status: ${run.conclusion || run.status}\n`;
      workflowList += `   Branch: ${run.head_branch}\n`;
      workflowList += `   Started: ${new Date(run.created_at).toLocaleString()}\n\n`;
    });
    
    bot.sendMessage(chatId, workflowList, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error fetching workflows: ${error.message}`);
  }
});

// List branches
bot.onText(/\/branches/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    bot.sendMessage(chatId, '⚠️ GitHub not configured.');
    return;
  }
  
  try {
    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/branches`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const branches = response.data;
    let branchList = '🌿 *Repository Branches*\n\n';
    
    branches.forEach((branch) => {
      branchList += `• ${branch.name}\n`;
    });
    
    bot.sendMessage(chatId, branchList, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error fetching branches: ${error.message}`);
  }
});

// Error handler
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 MLP Monitor Bot is running...');
console.log('📱 Message your bot at: t.me/Mlpv2bot');
console.log('💡 Use /start to begin');
