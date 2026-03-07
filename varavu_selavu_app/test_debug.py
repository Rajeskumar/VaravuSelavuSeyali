from fastapi.testclient import TestClient
from varavu_selavu_service.main import app
from varavu_selavu_service.auth.security import auth_required

def override_auth(): return "test@user.com"
app.dependency_overrides[auth_required] = override_auth

client = TestClient(app)
print(client.get("/api/v1/analysis?use_cache=false").json())
