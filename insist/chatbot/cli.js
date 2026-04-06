const readline = require("readline");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

// 1. Inisialisasi gRPC Client
// Perbaiki path agar node cli.js bisa dijalankan dari folder manapun
const PROTO_PATH = path.join(__dirname, "../project-finance-bot/finance.proto");
const packageDef = protoLoader.loadSync(PROTO_PATH);
const grpcObj = grpc.loadPackageDefinition(packageDef);
const client = new grpcObj.FinanceService(
  "localhost:50051", // Pastikan port sesuai dengan server Python
  grpc.credentials.createInsecure()
);

// 2. Inisialisasi Readline untuk Interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let currentUserId = "";

// Helper untuk format Rupiah
function formatRp(amount) {
  return `Rp ${Number(amount).toLocaleString('id-ID')}`;
}

// 3. Fungsi Utama & Menu
function startApp() {
  console.clear();
  console.log("=========================================");
  console.log("💰 SELAMAT DATANG DI APLIKASI KEUANGAN 💰");
  console.log("=========================================");
  
  rl.question("👉 Masukkan User ID Anda (bebas, cth: user1): ", (answer) => {
    if (!answer.trim()) {
      console.log("❌ User ID tidak boleh kosong!");
      return startApp();
    }
    currentUserId = answer.trim();
    console.log(`\n✅ Login sukses sebagai: ${currentUserId}`);
    showMenu();
  });
}

function showMenu() {
  console.log(`\n=== 🤖 MENU UTAMA | Akun: ${currentUserId} ===`);
  console.log("1. 📥 Tambah Pemasukan");
  console.log("2. 📤 Tambah Pengeluaran");
  console.log("3. 💳 Cek Saldo & Ringkasan");
  console.log("4. 📜 Riwayat Transaksi");
  console.log("5. 📊 Laporan Riwayat per Kategori");
  console.log("0. 🚪 Keluar / Ganti Akun");
  
  rl.question("\n👉 Pilih menu (0-5): ", handleMenu);
}

function handleMenu(choice) {
  switch (choice.trim()) {
    case "1":
      addTransaction("income");
      break;
    case "2":
      addTransaction("expense");
      break;
    case "3":
      checkBalance();
      break;
    case "4":
      checkHistory();
      break;
    case "5":
      reportByCategory();
      break;
    case "0":
      console.log("👋 Terima kasih telah menggunakan aplikasi ini!\n");
      currentUserId = "";
      startApp(); // Kembali ke login
      break;
    default:
      console.log("❌ Pilihan tidak valid. Silakan coba lagi.");
      showMenu();
      break;
  }
}

// ==========================================
// FITUR 1 & 2: Tambah Transaksi (Unary gRPC)
// ==========================================
function addTransaction(type) {
  const typeName = type === "income" ? "Pemasukan" : "Pengeluaran";
  
  rl.question(`\n💵 Masukkan jumlah ${typeName} (angka): `, (amountStr) => {
    const amount = Number(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
      console.log("❌ Jumlah harus berupa angka dan lebih besar dari 0!");
      return showMenu();
    }

    if (type === "income") {
      sendTransaction("income", amount, "income");
    } else {
      rl.question(`🗂️ Masukkan kategori (cth: makan, belanja, transport): `, (category) => {
        if (!category.trim()) category = "lainnya";
        sendTransaction("expense", amount, category.toLowerCase());
      });
    }
  });
}

function sendTransaction(type, amount, category) {
  client.AddTransaction({ userId: currentUserId, type: type, amount: amount, category: category }, (err, response) => {
    if (err) {
      console.log(`\n❌ Error: ${err.details || err.message}`);
    } else {
      console.log(`\n✅ BERHASIL: ${response.message}`);
    }
    showMenu();
  });
}

// ==========================================
// FITUR 3: Cek Saldo (Unary gRPC)
// ==========================================
function checkBalance() {
  client.GetSummary({ userId: currentUserId }, (err, response) => {
    if (err) {
      console.log(`\n❌ Gagal memuat saldo: ${err.details || err.message}`);
    } else {
      const totalIncome = response.totalIncome || 0;
      const totalExpense = response.totalExpense || 0;
      const balance = totalIncome - totalExpense;
      const status = balance < 0 ? "⚠️ (Defisit)" : "✅ (Sehat)";

      console.log("\n💼 LAPORAN KEUANGAN 💼");
      console.log("──────────────────────────");
      console.log(`🟢 Pemasukan   : ${formatRp(totalIncome)}`);
      console.log(`🔴 Pengeluaran : ${formatRp(totalExpense)}`);
      console.log("──────────────────────────");
      console.log(`💳 SISA SALDO  : ${formatRp(balance)} ${status}`);
    }
    showMenu();
  });
}

// ==========================================
// FITUR 4: Riwayat Transaksi (Server-Side Streaming)
// ==========================================
function checkHistory() {
  const callStream = client.GetHistory({ userId: currentUserId });
  let count = 0;

  console.log("\n📜 BUKU RIWAYAT TRANSAKSI 📜");
  console.log("───────────────────────────");

  callStream.on("data", (tx) => {
    count++;
    const isIncome = tx.type === "income";
    const icon = isIncome ? "🟢 Pemasukan" : "🔴 Pengeluaran";
    const sign = isIncome ? "+" : "-";
    const cat = isIncome ? "" : `- ${tx.category.toUpperCase()}`;
    
    console.log(`${count}. ${icon} ${cat}`);
    console.log(`   ${sign}${formatRp(tx.amount)}\n`);
  });

  callStream.on("end", () => {
    if (count === 0) console.log("📝 Belum ada transaksi.");
    console.log(`───────────────────────────\n📋 Total Catatan: ${count} transaksi`);
    showMenu();
  });

  callStream.on("error", (err) => {
    if (err.code === grpc.status.NOT_FOUND) {
      console.log("📝 Belum ada catatan transaksi (Kosong).");
    } else {
      console.log(`❌ Gagal memuat riwayat: ${err.message}`);
    }
    showMenu();
  });
}

// ==========================================
// FITUR 5: Laporan per Kategori (Logika Klien + Streaming gRPC)
// ==========================================
function reportByCategory() {
  const callStream = client.GetHistory({ userId: currentUserId });
  const categoryStats = {};
  let found = false;

  callStream.on("data", (tx) => {
    found = true;
    if (tx.type === "expense") {
      categoryStats[tx.category] = (categoryStats[tx.category] || 0) + tx.amount;
    }
  });

  callStream.on("end", () => {
    console.log("\n📊 LAPORAN PENGELUARAN PER KATEGORI 📊");
    console.log("─────────────────────────────────────");
    
    if (!found || Object.keys(categoryStats).length === 0) {
      console.log("✨ Belum ada data pengeluaran.");
    } else {
      // Sorting kategori berdasarkan pengeluaran terbesar
      const sortedCats = Object.entries(categoryStats).sort((a, b) => b[1] - a[1]);
      
      sortedCats.forEach(([cat, amount], index) => {
        console.log(`${index + 1}. 🏷️ ${cat.toUpperCase().padEnd(12)} : ${formatRp(amount)}`);
      });
    }
    console.log("─────────────────────────────────────");
    showMenu();
  });

  callStream.on("error", (err) => {
    if (err.code === grpc.status.NOT_FOUND) {
      console.log("\n📊 LAPORAN PENGELUARAN PER KATEGORI 📊\n📝 Anda belum memiliki catatan transaksi.");
    } else {
      console.log(`\n❌ Gagal memuat laporan: ${err.message}`);
    }
    showMenu();
  });
}

// Jalankan Aplikasi
startApp();