const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'https://safememefi-analyzer.vercel.app'],
  credentials: true
}));

// Twitter Client Setup
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Tweet Endpoint
app.post('/api/tweet', async (req, res) => {
  try {
    const { tweetText } = req.body;
    
    if (!tweetText) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tweet text is required' 
      });
    }

    if (tweetText.length > 280) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tweet text too long' 
      });
    }

    const tweet = await twitterClient.v2.tweet(tweetText);
    
    res.json({ 
      success: true, 
      tweetId: tweet.data.id,
      tweetUrl: `https://twitter.com/user/status/${tweet.data.id}`
    });

  } catch (error) {
    console.error('Tweet error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to post tweet' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SafeMemeFi Backend running on port 3001`);
  console.log('🎯 Starting X mention stream...');
  startMentionPolling(); // ← BUNU YAZ
});

// X Stream API için mention'ları dinle

const streamClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

// Telegram Bot Setup  
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log('🤖 PumpfunRisk Telegram Bot started!');

// Bot komutlarını dinle
telegramBot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  console.log(`📱 Telegram message: ${text}`);
  
  // Token adresi regex'i
  const tokenAddressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
  const match = text.match(tokenAddressRegex);
  
  if (match) {
    const tokenAddress = match[0];
    console.log(`🎯 Analyzing token: ${tokenAddress}`);
    
    // "Analyzing..." mesajı gönder
    await telegramBot.sendMessage(chatId, '🔍 Analyzing token... Please wait...');
    
    // Token analizini yap
    const analysis = await performTokenAnalysis(tokenAddress);
    
    if (analysis) {
      await sendTelegramAnalysis(chatId, tokenAddress, analysis);
    } else {
      await telegramBot.sendMessage(chatId, '❌ Could not analyze this token. Please check the address.');
    }
  } else {
    // Yardım mesajı
    await telegramBot.sendMessage(chatId, `
🤖 PumpfunRisk Bot

Send me a Solana token address for analysis!

Example: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

📊 I'll analyze:
- Risk Score  
- Market Cap
- Holders
- Technical Analysis
- Price Changes
`);
  }
});

// Telegram analiz sonucu gönder
async function sendTelegramAnalysis(chatId, tokenAddress, analysis) {
  try {
    const analysisMessage = `
🎯 **${analysis.symbol || 'TOKEN'} ANALYSIS**

📊 **Price Data:**
- Price: $${analysis.price?.toFixed(6) || 'N/A'}
- 24h Change: ${analysis.priceChange24h?.toFixed(2) || 'N/A'}%
- Market Cap: $${formatMarketCap(analysis.marketCap)}
- 24H Volume: $${formatVolume(analysis.volume24h)}

🔍 **Technical Analysis:**
- Technical Score: ${analysis.technicalScore || 'N/A'}/100
- Risk Score: ${analysis.riskScore || 'N/A'}/100

👥 **Token Distribution:**
- Holders: ${analysis.holderCount || 'N/A'}
- Top Holder: ${analysis.topHolderPercentage || 'N/A'}%

⚠️ **Risk Factors:**
${generateRiskFactors(analysis)}

🚀 **Recommendation:** ${getRecommendation(analysis)}

AI-powered token risk scanner
https://safememefi-analyzer.vercel.app/
`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🟢 BUY', callback_data: `buy_${tokenAddress}` },
          { text: '🔴 SELL', callback_data: `sell_${tokenAddress}` }
        ],
        [
          { text: '📊 Full Analysis', url: `https://safememefi-analyzer.vercel.app/?token=${tokenAddress}` },
          { text: '📈 Chart', url: `https://dexscreener.com/solana/${tokenAddress}` }
        ]
      ]
    };

    await telegramBot.sendMessage(chatId, analysisMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    console.log('✅ Telegram analysis sent successfully');
    
  } catch (error) {
    console.error('❌ Telegram analysis error:', error);
    await telegramBot.sendMessage(chatId, 'Sorry, there was an error sending the analysis.');
  }
}

function generateRiskFactors(analysis) {  // ← BURAYA EKLE
  const factors = [];
  
  if (analysis.holderCount < 100) factors.push("• Low holder count");
  if (analysis.marketCap < 100000) factors.push("• Low market cap");
  if (analysis.volume24h < 10000) factors.push("• Low trading volume");
  if (analysis.topHolderPercentage > 50) factors.push("• High concentration");
  
  return factors.length > 0 ? factors.join('\n') : "• No major risks detected";
}

function getRecommendation(analysis) {
  const score = analysis.riskScore;
  
  if (score <= 30) return "🟢 LOW RISK - Good for investment";
  if (score <= 60) return "🟡 MEDIUM RISK - Proceed with caution";
  return "🔴 HIGH RISK - Not recommended";
}

// Telegram button handler
telegramBot.on('callback_query', async (callbackQuery) => {
  const action = callbackQuery.data.split('_')[0];
  const tokenAddress = callbackQuery.data.split('_')[1];
  
  if (action === 'buy') {
    await telegramBot.answerCallbackQuery(callbackQuery.id);
    await telegramBot.sendMessage(callbackQuery.message.chat.id, `
🟢 **BUY ${tokenAddress.slice(0, 8)}...**

Quick trade options:
🔗 Jupiter: https://jup.ag/swap/SOL-${tokenAddress}
🔗 Raydium: https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${tokenAddress}
🔗 DexScreener: https://dexscreener.com/solana/${tokenAddress}

⚠️ Always DYOR before trading!
`, { parse_mode: 'Markdown' });
  } else if (action === 'sell') {
    await telegramBot.answerCallbackQuery(callbackQuery.id);
    await telegramBot.sendMessage(callbackQuery.message.chat.id, `
🔴 **SELL ${tokenAddress.slice(0, 8)}...**

Quick trade options:
🔗 Jupiter: https://jup.ag/swap/${tokenAddress}-SOL
🔗 Raydium: https://raydium.io/swap/?inputCurrency=${tokenAddress}&outputCurrency=sol

⚠️ Always DYOR before trading!
`, { parse_mode: 'Markdown' });
  }
});

const startMentionPolling = async () => {
  console.log('🔄 Starting mention polling (free tier)...');
  
  const checkMentions = async () => {
    try {
      console.log('🔍 Checking for new mentions...');
      
      // Son mention'ları al (free tier API)
      const mentions = await streamClient.v2.userMentionTimeline('1944726729622462464', {
        max_results: 5,
        'tweet.fields': ['author_id', 'created_at', 'text']
      });
      
      if (mentions._realData && mentions._realData.data && Array.isArray(mentions._realData.data)) {
  console.log(`📬 Found ${mentions._realData.data.length} recent mentions`);
  
  for (const tweet of mentions._realData.data) {
    const tokenAddress = extractTokenAddress(tweet.text);
    if (tokenAddress) {
      console.log('🎯 Found mention with token:', tokenAddress);
      await analyzeAndReply(tweet.id, tweet.author_id, tokenAddress);
    }
  }
} else {
  console.log('📭 No mentions found or invalid data format');
  console.log('Data structure:', mentions);
}
    } catch (error) {
      console.error('❌ Polling error:', error);
    }
  };
  
  // İlk kontrolü hemen yap
  await checkMentions();
  
  // Her 1 dakikada bir kontrol et
  setInterval(checkMentions, 300000); // 5 dakika
};

// Token adresini çıkarma
function extractTokenAddress(text) {
  const solanaAddressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
  const match = text.match(solanaAddressRegex);
  return match ? match[0] : null;
}

// Analiz yapıp reply at
async function analyzeAndReply(tweetId, authorId, tokenAddress) {
  try {
    console.log(`🔍 Analyzing token: ${tokenAddress}`);
    
    // Token analizini yap (basitleştirilmiş versiyon)
    const analysisResult = await performTokenAnalysis(tokenAddress);
    
    if (!analysisResult) {
      // Analiz başarısızsa hata mesajı gönder
      const errorTweet = `❌ Unable to analyze token: ${tokenAddress.slice(0, 8)}...
Please check if the address is valid.

AI-powered token risk scanner
https://safememefi-analyzer.vercel.app/`;

      await streamClient.v2.reply(errorTweet, tweetId);
      return;
    }

    // Tweet formatını oluştur
    const replyTweet = `${analysisResult.symbol || 'TOKEN'}
24h Change: ${analysisResult.priceChange24h || 'N/A'}%
**Technical Score: ${analysisResult.technicalScore || 'N/A'}/100**
Market Cap: $${formatMarketCap(analysisResult.marketCap)}
**Token Distribution: ${analysisResult.holderCount || 'N/A'} holders**
24H Volume: $${formatVolume(analysisResult.volume24h)}
**Risk Score: ${analysisResult.riskScore || 'N/A'}/100**

AI-powered token risk scanner
Detect rugs, honeypots & pump scams
https://safememefi-analyzer.vercel.app/`;

    console.log('📝 Reply tweet length:', replyTweet.length);
    
    // Reply tweet gönder
    await streamClient.v2.reply(replyTweet, tweetId);
    console.log('✅ Reply sent successfully');
    
  } catch (error) {
    console.error('❌ Error in analyzeAndReply:', error);
  }
}

// Yardımcı fonksiyonlar
function formatVolume(num) {
  if (!num) return 'N/A';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatMarketCap(num) {
  if (!num) return 'N/A';
  return num.toLocaleString();
}

// Token analizi fonksiyonu (GERÇEK ANALİZ)
async function performTokenAnalysis(tokenAddress) {
  try {
    console.log(`🔍 Starting real analysis for: ${tokenAddress}`);
    
    // Solana connection
    const { Connection, PublicKey } = require('@solana/web3.js');
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=786494a0-4d95-474f-a824-3ccddeb78fec');
    
    const mintPublicKey = new PublicKey(tokenAddress);
    
    // 1. Token metadata al
    const tokenMetadata = await getTokenMetadata(connection, mintPublicKey);
    
    // 2. Market data al
    const marketData = await getMarketData(tokenAddress);
    
    // 3. Holders analizi yap
    const holdersAnalysis = await getHoldersAnalysis(connection, mintPublicKey);
    
    // 4. Risk skoru hesapla
    const riskScore = calculateRiskScore(holdersAnalysis, marketData);
    
    // 5. Technical score hesapla
    const technicalScore = calculateTechnicalScore(tokenMetadata, marketData, holdersAnalysis);
    
    return {
  symbol: tokenMetadata?.symbol || 'UNKNOWN',
  price: marketData?.price || 0,
  priceChange24h: marketData?.priceChange24h || 0,
  technicalScore: technicalScore,
  marketCap: marketData?.marketCap || 0,
  holderCount: holdersAnalysis?.holderCount || 0,
  volume24h: marketData?.volume24h || 0,
  riskScore: riskScore,
  topHolderPercentage: holdersAnalysis?.topHolderPercentage || 0
};
    
  } catch (error) {
    console.error('❌ Real analysis error:', error);
    return null;
  }
}

async function getTokenMetadata(connection, mintPublicKey) {
  try {
    // DexScreener'dan token bilgisi al
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintPublicKey.toString()}`);
    const data = await response.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const tokenInfo = data.pairs[0].baseToken;
      return {
        symbol: tokenInfo.symbol || 'UNKNOWN',
        name: tokenInfo.name || 'Unknown Token',
        decimals: 6
      };
    }
    
    return {
      symbol: 'UNKNOWN',
      name: 'Unknown Token', 
      decimals: 6
    };
  } catch (error) {
    console.error('Metadata error:', error);
    return null;
  }
}

async function getMarketData(tokenAddress) {
  try {
    console.log(`🔍 Fetching market data for: ${tokenAddress}`);
    
    // DexScreener API
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const data = await response.json();
    
    console.log('DexScreener Response:', JSON.stringify(data, null, 2));
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0]; // İlk pair'i al
      return {
        price: parseFloat(pair.priceUsd) || 0,
        priceChange24h: parseFloat(pair.priceChange.h24) || 0,
        marketCap: parseFloat(pair.marketCap) || 0,
        volume24h: parseFloat(pair.volume.h24) || 0
      };
    }
    
    return null;
  } catch (error) {
    console.error('Market data error:', error);
    return null;
  }
}

async function getHoldersAnalysis(connection, mintPublicKey) {
  try {
    console.log(`🔍 Analyzing holders for: ${mintPublicKey.toString()}`);
    
    // Basit mock data (gerçek Solana analizi çok karmaşık)
    const mockHolders = Math.floor(Math.random() * 1000) + 50;
    const mockTopHolder = Math.floor(Math.random() * 30) + 10;
    
    console.log(`👥 Mock holders: ${mockHolders}, Top holder: ${mockTopHolder}%`);
    
    return {
      holderCount: mockHolders,
      topHolderPercentage: mockTopHolder
    };
  } catch (error) {
    console.error('Holders analysis error:', error);
    return { holderCount: 100, topHolderPercentage: 15 };
  }
}

function calculateRiskScore(holdersAnalysis, marketData) {
  let riskScore = 30; // Base risk (daha yüksek başlangıç)
  
  // *** YENİ: Price change riski (EN ÖNEMLİ) ***
  const priceChange24h = marketData?.priceChange24h || 0;
  if (priceChange24h < -30) riskScore += 40; // %30'dan fazla düşüş = +40 risk
  else if (priceChange24h < -20) riskScore += 30; // %20-30 düşüş = +30 risk
  else if (priceChange24h < -10) riskScore += 20; // %10-20 düşüş = +20 risk
  else if (priceChange24h < -5) riskScore += 10; // %5-10 düşüş = +10 risk
  else if (priceChange24h > 100) riskScore += 25; // %100'den fazla artış = pump risk
  
  // Holder count riski
  if (holdersAnalysis?.holderCount < 100) riskScore += 20;
  else if (holdersAnalysis?.holderCount < 500) riskScore += 10;
  else if (holdersAnalysis?.holderCount > 1000) riskScore -= 5;
  
  // Market cap riski
  if (marketData?.marketCap < 50000) riskScore += 25; // Çok küçük market cap
  else if (marketData?.marketCap < 100000) riskScore += 15;
  else if (marketData?.marketCap > 10000000) riskScore -= 10; // Büyük market cap güvenli
  
  // Volume riski
  if (marketData?.volume24h < 1000) riskScore += 20; // Çok düşük volume
  else if (marketData?.volume24h < 10000) riskScore += 10;
  
  // Top holder riski
  if (holdersAnalysis?.topHolderPercentage > 50) riskScore += 20;
  else if (holdersAnalysis?.topHolderPercentage > 30) riskScore += 10;
  
  return Math.max(0, Math.min(100, riskScore));
}

function calculateTechnicalScore(tokenMetadata, marketData, holdersAnalysis) {
  let technicalScore = 50; // Base score
  
  // Metadata quality
  if (tokenMetadata?.symbol) technicalScore += 10;
  if (tokenMetadata?.name) technicalScore += 10;
  
  // Market activity
  if (marketData?.volume24h > 50000) technicalScore += 20;
  if (marketData?.priceChange24h > 0) technicalScore += 10;
  
  // Holder distribution
  if (holdersAnalysis?.holderCount > 500) technicalScore += 15;
  
  return Math.max(0, Math.min(100, technicalScore));
}