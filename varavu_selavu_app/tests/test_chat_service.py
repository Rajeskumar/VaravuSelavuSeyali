import os
import pytest
from unittest.mock import patch, MagicMock

# Assuming running from varavu_selavu_app directory
from varavu_selavu_service.services import chat_service

@pytest.fixture
def clean_env():
    # Set dummy API key
    os.environ["OPENAI_API_KEY"] = "dummy-key"
    # Ensure OPENAI_MODEL is not set so we test the default
    if "OPENAI_MODEL" in os.environ:
        del os.environ["OPENAI_MODEL"]
    yield
    # Cleanup if needed

def test_list_openai_models(clean_env):
    expected_models = ['gpt-5 mini', 'gpt-5.2', 'gpt-5', 'gpt-5.2 pro']

    # We expect list_openai_models to return the static list
    models = chat_service.list_openai_models()
    assert models == expected_models

@patch("varavu_selavu_service.services.chat_service.requests.post")
def test_call_openai_default_model(mock_post, clean_env):
    # Mock response
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Hello"}}]
    }
    mock_post.return_value = mock_response

    # Call with no model specified
    chat_service.call_openai("query", {"data": "test"})

    # Verify the model used in the payload
    args, kwargs = mock_post.call_args
    payload = kwargs.get("json", {})
    assert payload.get("model") == "gpt-5 mini"
