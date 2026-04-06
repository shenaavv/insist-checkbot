const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const packageDef = protoLoader.loadSync("../project-finance-bot/finance.proto");
const grpcObj = grpc.loadPackageDefinition(packageDef);
const client = new grpcObj.FinanceService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

client.AddTransaction({ userId: "user1", type: "income", amount: 100, category: "others" }, (err, res) => {
  console.log("Add 1:", err, res);
  client.AddTransaction({ userId: "user1", type: "expense", amount: 200, category: "others" }, (err, res) => {
    console.log("Add 2:", err, res);
    client.GetSummary({ userId: "user1" }, (err, res) => {
      console.log("Summary:", err, res);
    });
  });
});
