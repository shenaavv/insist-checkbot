const express = require("express");
const bodyParser = require("body-parser");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const app = express();
app.use(bodyParser.json());

// Load proto definition with absolute path
const PROTO_PATH = path.join(__dirname, "../project-finance-bot/finance.proto");
const packageDef = protoLoader.loadSync(PROTO_PATH);
const grpcObj = grpc.loadPackageDefinition(packageDef);
const client = new grpcObj.FinanceService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

// ===================================
// HELPER FUNCTIONS
// ===================================

// Extract amount from user message using regex
function extractAmount(message) {
  const match = message.match(/\d+(?:,\d{3})*|\d+/);
  if (match) {
    return parseInt(match[0].replace(/,/g, ""), 10);
  }
  return null;
}

// Detect category based on keywords in the message
function detectCategory(message) {
  const lowerMessage = message.toLowerCase();

  // Food category
  if (
    lowerMessage.includes("eat") ||
    lowerMessage.includes("makan") ||
    lowerMessage.includes("food") ||
    lowerMessage.includes("dinner") ||
    lowerMessage.includes("lunch") ||
    lowerMessage.includes("breakfast")
  ) {
    return "food";
  }

  // Shopping category
  if (
    lowerMessage.includes("belanja") ||
    lowerMessage.includes("shopping") ||
    lowerMessage.includes("buy") ||
    lowerMessage.includes("beli")
  ) {
    return "shopping";
  }

  // Transport category
  if (
    lowerMessage.includes("transport") ||
    lowerMessage.includes("transportasi") ||
    lowerMessage.includes("travel") ||
    lowerMessage.includes("bus") ||
    lowerMessage.includes("taxi") ||
    lowerMessage.includes("ojek")
  ) {
    return "transport";
  }

  // Savings category
  if (
    lowerMessage.includes("tabung") ||
    lowerMessage.includes("menabung") ||
    lowerMessage.includes("saving") ||
    lowerMessage.includes("save")
  ) {
    return "savings";
  }

  // Default category
  return "others";
}

// Detect transaction type (income or expense) based on keywords
function detectType(message) {
  const lowerMessage = message.toLowerCase();

  // Income keywords
  if (
    lowerMessage.includes("income") ||
    lowerMessage.includes("gaji") ||
    lowerMessage.includes("earning") ||
    lowerMessage.includes("earn") ||
    lowerMessage.includes("add income") ||
    lowerMessage.includes("dapat") ||
    lowerMessage.includes("terima") ||
    lowerMessage.includes("bonus")
  ) {
    return "income";
  }

  // Expense keywords - if any of these are found, it's an expense
  if (
    lowerMessage.includes("spend") ||
    lowerMessage.includes("spent") ||
    lowerMessage.includes("eat") ||
    lowerMessage.includes("makan") ||
    lowerMessage.includes("belanja") ||
    lowerMessage.includes("bayar") ||
    lowerMessage.includes("beli") ||
    lowerMessage.includes("shopping") ||
    lowerMessage.includes("transport") ||
    lowerMessage.includes("transportasi")
  ) {
    return "expense";
  }

  // Default: treat as expense if amount is mentioned
  return "expense";
}

// Format response message with emojis
function formatResponse(type, amount, category) {
  const categoryEmojis = {
    food: "🍔 Makan",
    shopping: "🛍️ Belanja",
    transport: "🚗 Transport",
    savings: "💰 Tabungan",
    others: "💸 Lainnya"
  };

  const formattedAmount = `Rp ${amount.toLocaleString('id-ID')}`;
  const catStr = categoryEmojis[category] || "💸 Lainnya";

  if (type === "income") {
    return `✅ *TRANSAKSI BERHASIL*\n` +
           `───────────────────────\n` +
           `🗂️ *Kategori:* 🟢 Pemasukan\n` +
           `💵 *Jumlah:*   +${formattedAmount}`;
  }

  return `✅ *TRANSAKSI BERHASIL*\n` +
         `───────────────────────\n` +
         `🗂️ *Kategori:* 🔴 ${catStr}\n` +
         `💴 *Jumlah:*   -${formattedAmount}`;
}

// ===================================
// ROUTES
// ===================================

// Main webhook endpoint to handle user messages
app.post("/webhook", (req, res) => {
  const message = req.body.message || "";
  const userId = req.body.user_id || "user1";

  console.log(`📨 Message from ${userId}: "${message}"`);
  console.log(`🔍 DEBUG: req.body =`, req.body);

  // Check if user is asking for balance
  if (
    message.toLowerCase().includes("balance") ||
    message.toLowerCase().includes("saldo") ||
    message.toLowerCase().includes("check balance")
  ) {
    client.GetSummary({ userId: String(userId) }, (err, response) => {
      if (err) {
        console.error("❌ Error fetching balance:", err.details || err.message);
        return res.json({ reply: "❌ Gagal mendapatkan saldo: " + (err.details || "Terjadi kesalahan internal") });
      }

      const totalIncome = response.totalIncome || 0;
      const totalExpense = response.totalExpense || 0;
      const currentBalance = totalIncome - totalExpense;

      // Handle minus di balance secara proper
      const balanceSign = currentBalance < 0 ? "-" : "";
      const status = currentBalance < 0 ? "⚠️ (Defisit)" : "✅ (Balance)";
      
      const reply =
        `💼 *LAPORAN KEUANGAN* 💼\n` +
        `────────────────────────\n` +
        `🟢 *Pemasukan*   : Rp ${totalIncome.toLocaleString('id-ID')}\n` +
        `🔴 *Pengeluaran* : Rp ${totalExpense.toLocaleString('id-ID')}\n` +
        `────────────────────────\n` +
        `💳 *SISA SALDO*  : ${balanceSign}Rp ${Math.abs(currentBalance).toLocaleString('id-ID')} ${status}`;

      console.log(`✅ Balance retrieved for ${userId}:\n${reply}\n`);
      if (req.headers['user-agent'] && req.headers['user-agent'].includes('curl')) {
        return res.send(reply + '\n'); // Supaya di terminal / curl enter kebawah
      }
      res.json({ reply });
    });

    return;
  }

  // Cek apakah user menanyakan history/riwayat untuk mencoba Streaming gRPC
  if (
    message.toLowerCase().includes("history") ||
    message.toLowerCase().includes("riwayat") ||
    message.toLowerCase().includes("transaksi")
  ) {
    const callStream = client.GetHistory({ userId: String(userId) });
    let historyReply = "📜 *BUKU RIWAYAT TRANSAKSI* 📜\n───────────────────────────\n";
    let transactionCount = 0;
    
    const catMap = { food: "🍔 Makan", shopping: "🛍️ Belanja", transport: "🚗 Transport", savings: "💰 Tabungan", others: "💸 Lainnya" };

    callStream.on("data", (tx) => {
      transactionCount++;
      const isIncome = tx.type === "income";
      const icon = isIncome ? "🟢 Pemasukan" : "🔴 Pengeluaran";
      const sign = isIncome ? "+" : "-";
      const cat = isIncome ? "" : `- ${catMap[tx.category] || tx.category}`;
      
      historyReply += `${transactionCount}. ${icon} ${cat}\n` +
                      `   ${sign}Rp ${tx.amount.toLocaleString('id-ID')}\n\n`;
    });

    callStream.on("end", () => {
      historyReply += `───────────────────────────\n📋 *Total Catatan:* ${transactionCount} transaksi`;
      console.log(`✅ History retrieved for ${userId}:\n${historyReply}\n`);
      if (req.headers['user-agent'] && req.headers['user-agent'].includes('curl')) {
        return res.send(historyReply + '\n');
      }
      res.json({ reply: historyReply });
    });

    callStream.on("error", (err) => {
      let errMessage = "❌ Terjadi masalah saat membaca riwayat. Coba beberapa saat lagi.";
      
      // Menangkap error dari Server Streaming gRPC (misalnya Not Found)
      if (err.code === grpc.status.NOT_FOUND) {
        errMessage = "📝 Anda belum memiliki catatan transaksi apa pun.";
      } else if (err.code === grpc.status.UNAVAILABLE) {
        errMessage = "❌ Server Backend (Python) sedang mati atau tidak bisa dihubungi.";
      }
      
      console.log(`❌ Error riwayat untuk ${userId}:`, err.message);
      if (req.headers['user-agent'] && req.headers['user-agent'].includes('curl')) {
        return res.send(errMessage + '\n');
      }
      return res.json({ reply: errMessage });
    });

    return;
  }

  // Try to extract amount from message
  const amount = extractAmount(message);

  if (!amount) {
    return res.json({
      reply: "❌ Please provide an amount (e.g., 'income 100000' or 'eat 20000')"
    });
  }

  // Detect transaction type and category
  const type = detectType(message);
  const category = detectCategory(message);

  console.log(
    `📝 Processing: type=${type}, amount=${amount}, category=${category}`
  );

  // Call gRPC AddTransaction method
  client.AddTransaction(
    {
      userId: String(userId),
      type: String(type),
      amount: Number(amount),
      category: String(category)
    },
    (err, response) => {
      if (err) {
        console.error("❌ Error adding transaction:", err);
        return res.json({
          reply: "❌ Error recording transaction. Please try again."
        });
      }

      const reply = formatResponse(type, amount, category);
      console.log(`✅ Transaction recorded:\n${reply}\n`);
      if (req.headers['user-agent'] && req.headers['user-agent'].includes('curl')) {
        return res.send(reply + '\n');
      }
      res.json({ reply });
    }
  );
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.send("OK");
});

// ===================================
// START SERVER
// ===================================

app.listen(3000, () => {
  console.log("🚀 Finance Chatbot Server running on port 3000");
  console.log("📍 Webhook endpoint: POST /webhook");
  console.log("📍 Health check: GET /health");
});
