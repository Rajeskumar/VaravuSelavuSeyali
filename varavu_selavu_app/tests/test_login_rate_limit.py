"""The login limit (5/minute per caller). The browser suite budgets around it; nothing else proved it blocks."""

from varavu_selavu_service.db.models import User


def _attempt(test_client, ip: str, password: str = "wrong-password"):
    return test_client.post(
        "/api/v1/auth/login",
        data={"username": "limit@test.com", "password": password},
        headers={"cf-connecting-ip": ip},
    )


def test_sixth_login_in_a_minute_is_blocked_even_with_the_right_password(test_client, db_session):
    with_password = "right-password-123"
    from varavu_selavu_service.auth.security import hash_password

    db_session.add(User(email="limit@test.com", name="Limit", password_hash=hash_password(with_password)))
    db_session.commit()

    assert [_attempt(test_client, "203.0.113.7").status_code for _ in range(5)] == [401] * 5

    assert _attempt(test_client, "203.0.113.7").status_code == 429
    assert _attempt(test_client, "203.0.113.7", with_password).status_code == 429


def test_one_callers_blocked_logins_do_not_block_another_caller(test_client, db_session):
    for _ in range(6):
        _attempt(test_client, "203.0.113.7")

    assert _attempt(test_client, "203.0.113.7").status_code == 429
    assert _attempt(test_client, "198.51.100.9").status_code == 401
