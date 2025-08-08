from pydantic import BaseModel

class LoginRequest(BaseModel):
    email: str
    password: str

class ExpenseRequest(BaseModel):
    amount: float
    category: str
    date: str
    description: str = ""

# Add more API models here as needed

