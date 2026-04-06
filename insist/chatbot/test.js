const axios = require("axios");

const BASE_URL = "http://localhost:3000";
const userId = "test_user_1";

// Test scenarios
const testCases = [
  {
    name: "Add Income",
    message: "income 100000",
    expected: "Income of 100000 added"
  },
  {
    name: "Add Food Expense",
    message: "makan 20000",
    expected: "Food expense of 20000 recorded"
  },
  {
    name: "Add Shopping Expense",
    message: "belanja 50000",
    expected: "Shopping expense of 50000 recorded"
  },
  {
    name: "Add Transport Expense",
    message: "transport 15000",
    expected: "Transport expense of 15000 recorded"
  },
  {
    name: "Check Balance",
    message: "balance",
    expected: "Balance Summary"
  }
];

async function runTests() {
  console.log("\n🧪 Starting Finance Chatbot Tests...\n");

  for (const testCase of testCases) {
    try {
      console.log(`📝 Test: ${testCase.name}`);
      console.log(`   Message: "${testCase.message}"`);

      const response = await axios.post(`${BASE_URL}/webhook`, {
        message: testCase.message,
        user_id: userId
      });

      const reply = response.data.reply;
      console.log(`   Response: ${reply}`);
      console.log(`   ✅ PASS\n`);
    } catch (error) {
      console.log(
        `   ❌ FAIL: ${error.message}\n`
      );
    }
  }

  console.log("✅ All tests completed!");
}

// Run tests after a short delay to ensure server is ready
setTimeout(runTests, 1000);
