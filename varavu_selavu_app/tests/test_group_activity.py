import pytest
import uuid
from varavu_selavu_service.db.models import GroupActivity, User

def _create_user(db_session, email):
    user = User(id=uuid.uuid4(), email=email, password_hash="hash", name=email.split("@")[0])
    db_session.add(user)
    db_session.commit()
    return user

def _as_user(test_client, email):
    test_client.headers["Authorization"] = f"Bearer {email}"

def test_group_activity_logging(test_client, db_session):
    _create_user(db_session, "creator@test.com")
    _as_user(test_client, "creator@test.com")
    
    # Create group
    res = test_client.post("/api/v1/groups", json={"name": "Activity Test"})
    assert res.status_code == 201
    group_id = res.json()["group_id"]
    
    # Update group
    test_client.put(f"/api/v1/groups/{group_id}", json={"name": "Renamed Test"})
    
    # Create expense
    res_mem = test_client.get(f"/api/v1/groups/{group_id}")
    member_id = res_mem.json()["members"][0]["member_id"]
    
    res = test_client.post(f"/api/v1/groups/{group_id}/expenses", json={
        "date": "01/01/2026",
        "description": "Lunch",
        "category": "Food",
        "amount": 20.0,
        "payers": [{"member_id": member_id, "amount_paid": 20.0}],
        "split": {"type": "equal", "entries": [{"member_id": member_id}]}
    })
    assert res.status_code == 201
    
    # Fetch activity feed
    res = test_client.get(f"/api/v1/groups/{group_id}/activity")
    assert res.status_code == 200
    body = res.json()
    items = body["items"]
    
    # Actions are ordered desc, so newest first
    actions = [i["action"] for i in items]
    assert actions == ["expense_created", "group_updated", "group_created"]
    
    expense_log = items[0]
    assert expense_log["payload"]["description"] == "Lunch"
    
    update_log = items[1]
    assert update_log["payload"]["name"] == "Renamed Test"
    
def test_group_activity_pagination(test_client, db_session):
    _create_user(db_session, "creator2@test.com")
    _as_user(test_client, "creator2@test.com")
    
    res = test_client.post("/api/v1/groups", json={"name": "Activity Test 2"})
    group_id = res.json()["group_id"]
    
    for i in range(15):
        test_client.put(f"/api/v1/groups/{group_id}", json={"name": f"Name {i}"})
        
    res = test_client.get(f"/api/v1/groups/{group_id}/activity?limit=10&offset=0")
    assert len(res.json()["items"]) == 10
    assert res.json()["next_offset"] == 10
    
    res2 = test_client.get(f"/api/v1/groups/{group_id}/activity?limit=10&offset=10")
    assert len(res2.json()["items"]) == 6 # 15 updates + 1 create
    assert res2.json()["next_offset"] is None
