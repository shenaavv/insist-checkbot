const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const PROTO_PATH = path.join(__dirname, "../project-finance-bot/finance.proto");
const packageDef = protoLoader.loadSync(PROTO_PATH);
const grpcObj = grpc.loadPackageDefinition(packageDef);
const client = new grpcObj.FinanceService("localhost:50051", grpc.credentials.createInsecure());

console.log("Starting gRPC call...");
const call = client.GetHistory({ userId: "cla" });
call.on('data', d => console.log('DATA:', d));
call.on('error', e => console.error('ERROR:', e.message));
call.on('end', () => console.log('END'));
