def test_get_profile_defaults_payment_handles_to_none(test_client, db_session):
    res = test_client.get("/api/v1/auth/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["venmo_handle"] is None
    assert body["paypal_handle"] is None
    assert body["upi_id"] is None


def test_update_profile_sets_payment_handles(test_client, db_session):
    res = test_client.put(
        "/api/v1/auth/profile",
        json={"venmo_handle": "@rajesh", "paypal_handle": "rajesh.paypal", "upi_id": "rajesh@upi"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["venmo_handle"] == "@rajesh"
    assert body["paypal_handle"] == "rajesh.paypal"
    assert body["upi_id"] == "rajesh@upi"

    # Persisted, not just echoed back.
    res2 = test_client.get("/api/v1/auth/profile")
    assert res2.json()["venmo_handle"] == "@rajesh"


def test_update_profile_partial_update_preserves_other_fields(test_client, db_session):
    test_client.put("/api/v1/auth/profile", json={"venmo_handle": "@rajesh"})
    res = test_client.put("/api/v1/auth/profile", json={"upi_id": "rajesh@upi"})
    body = res.json()
    assert body["venmo_handle"] == "@rajesh"
    assert body["upi_id"] == "rajesh@upi"


def test_blank_handles_from_the_profile_form_do_not_block_a_save(test_client, db_session):
    """Both clients send "" for every handle left blank. That used to 422 the whole save, so a
    user without all three handles filled in couldn't even change their name."""
    res = test_client.put("/api/v1/auth/profile", json={
        "name": "New Name", "phone": "", "address": "",
        "venmo_handle": "", "paypal_handle": "", "upi_id": "",
    })
    assert res.status_code == 200, res.text
    profile = test_client.get("/api/v1/auth/profile").json()
    assert profile["name"] == "New Name"
    assert profile["venmo_handle"] is None and profile["upi_id"] is None


def test_blank_handle_clears_a_previously_set_handle(test_client, db_session):
    test_client.put("/api/v1/auth/profile", json={"venmo_handle": "alice-v", "upi_id": "alice@bank"})
    res = test_client.put("/api/v1/auth/profile", json={"venmo_handle": "", "upi_id": "alice@bank"})
    assert res.status_code == 200, res.text
    profile = test_client.get("/api/v1/auth/profile").json()
    assert profile["venmo_handle"] is None
    assert profile["upi_id"] == "alice@bank"

