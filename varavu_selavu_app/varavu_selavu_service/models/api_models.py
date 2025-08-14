from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str

class ExpenseRequest(BaseModel):
    user_id: str
    cost: float
    category: str
    date: str
    description: str = ""

class ChatRequest(BaseModel):
    """
    Payload for the `/analysis/chat` endpoint.

    * `user_id` – the identifier of the user making the request.
    * `query`   – the user’s chat question.
    * `year`    – optional year filter for the analysis.
    * `month`   – optional month filter for the analysis.
    * `start_date` and `end_date` – optional ISO date range filters.
    """
    user_id: str
    query: str
    year: int | None = None
    month: int | None = None
    start_date: str | None = None
    end_date: str | None = None

