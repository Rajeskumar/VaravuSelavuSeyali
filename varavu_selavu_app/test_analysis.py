import sys
from varavu_selavu_service.db.database import SessionLocal
from varavu_selavu_service.services.analysis_service import AnalysisService
from varavu_selavu_service.db.models import User

db = SessionLocal()
service = AnalysisService(db)
try:
    user = db.query(User).first()
    if not user:
        print("No users found.")
        sys.exit(0)
        
    print(f"Testing for user: {user.email}")
    res = service.analyze(user_id=user.email, year=2026, month=7, scope="i_paid")
    print("SUCCESS!")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
