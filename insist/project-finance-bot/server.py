import grpc
from concurrent import futures
import finance_pb2
import finance_pb2_grpc
import sys
import json
import os

DB_FILE = 'database.json'

# Database structure: {user_id: {"income": total, "expense": total, "transactions": []}}
def load_data():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ Error loading database: {e}")
    return {}

def save_data(data):
    try:
        with open(DB_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"⚠️ Error saving database: {e}")

data = load_data()

class FinanceService(finance_pb2_grpc.FinanceServiceServicer):
    def AddTransaction(self, request, context):
        user = request.user_id
        amount = request.amount
        transaction_type = request.type
        category = request.category

        # Initialize user data if not exists
        if user not in data:
            data[user] = {"income": 0, "expense": 0, "transactions": []}
            print(f"📝 Initializing new user: {user}", flush=True)
            
        # Perbaikan: Tambahkan array transactions jika user dari file database lama belum memilikinya
        if "transactions" not in data[user]:
            data[user]["transactions"] = []

        # Basic Error Handling: Prevent negative amount from being recorded
        if amount <= 0:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Amount must be greater than zero")
            
        # Add transaction to correct category
        if transaction_type == "income":
            data[user]["income"] += amount
            data[user]["transactions"].append({"type": "income", "amount": amount, "category": category})
            print(f"✅ Income +{amount} for {user} | Income: {data[user]['income']}, Expense: {data[user]['expense']}", flush=True)
        elif transaction_type == "expense":
            data[user]["expense"] += amount
            data[user]["transactions"].append({"type": "expense", "amount": amount, "category": category})
            print(f"💸 Expense +{amount} ({category}) for {user} | Income: {data[user]['income']}, Expense: {data[user]['expense']}", flush=True)
        else:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, f"Unknown transaction type: {transaction_type}")

        # Save to file
        save_data(data)

        # Calculate current balance
        current_balance = data[user]["income"] - data[user]["expense"]

        return finance_pb2.TransactionResponse(
            message=f"✅ Transaksi tercatat! Saldo saat ini: Rp {current_balance:,.0f}"
        )

    def GetSummary(self, request, context):
        user = request.user_id
        
        # Get user data, or initialize if not exists
        if user not in data:
            data[user] = {"income": 0, "expense": 0, "transactions": []}
            print(f"📝 Initializing new user for summary: {user}", flush=True)

        total_income = data[user]["income"]
        total_expense = data[user]["expense"]
        balance = total_income - total_expense

        print(f"📊 GetSummary for {user}: Income={total_income}, Expense={total_expense}, Balance={balance}", flush=True)

        return finance_pb2.SummaryResponse(
            total_income=total_income,
            total_expense=total_expense,
            balance=balance
        )

    # Server-Side Streaming RPC
    def GetHistory(self, request, context):
        user = request.user_id
        
        # Perbaikan: Cek jika "transactions" ada
        if user not in data or "transactions" not in data[user] or not data[user]["transactions"]:
            # Send an empty stream or custom error
            context.abort(grpc.StatusCode.NOT_FOUND, "No transaction history found for this user")
            
        # Stream transactions one by one
        for tx in data[user]["transactions"]:
            yield finance_pb2.HistoryResponse(
                type=tx["type"],
                amount=tx["amount"],
                category=tx["category"]
            )

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    finance_pb2_grpc.add_FinanceServiceServicer_to_server(
        FinanceService(), server
    )
    server.add_insecure_port('[::]:50051')
    server.start()
    print("🚀 gRPC Server running on port 50051")
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
