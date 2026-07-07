import os
from varavu_selavu_service.services.chat_service import call_chat_model

class MockAnalysisService:
    def analyze(self, *args, **kwargs):
        return {"total": 1500, "categories": {"groceries": 500}}

class MockInsightService:
    def calculate_item_detail(self, *args, **kwargs):
        return None

class MockAnalyticsService:
    def get_merchant_detail(self, *args, **kwargs):
        return None

messages = [
    {"role": "user", "content": "What is my total expense?"},
    {"role": "assistant", "content": "Your total expense for the last 3 months is $1500."},
    {"role": "user", "content": "What about just for groceries?"}
]

res = call_chat_model(
    messages=messages,
    user_id="test@test.com",
    analysis_service=MockAnalysisService(),
    analytics_service=MockAnalyticsService(),
    insight_service=MockInsightService(),
    model="llama3.1"
)

# call_chat_model now returns a ChatResult (TS-ANL-013) — response text plus the
# resolved period/scope — instead of a bare string.
print("RESPONSE:", res.response)
print("RESOLVED PERIOD:", res.resolved_period)
print("RESOLVED SCOPE:", res.resolved_scope)
