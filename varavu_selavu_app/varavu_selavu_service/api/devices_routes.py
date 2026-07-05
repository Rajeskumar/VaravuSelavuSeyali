from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from varavu_selavu_service.api.groups_routes import require_groups_enabled
from varavu_selavu_service.auth.security import auth_required
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.models.api_models import RegisterDeviceRequest, RegisterDeviceResponse
from varavu_selavu_service.services.notification_service import NotificationService


def get_notification_service(db: Session = Depends(get_db)) -> NotificationService:
    return NotificationService(db)


# Device registration only exists to support group-event push notifications (this
# ticket, TS-GRP-110), so it's gated behind the same rollout flag as every other
# group route — nothing group-related is reachable with GROUPS_ENABLED off.
router = APIRouter(prefix="/devices", tags=["Devices"], dependencies=[Depends(require_groups_enabled)])


@router.post("/register", response_model=RegisterDeviceResponse, summary="Register (or refresh) an Expo push token")
def register_device(
    data: RegisterDeviceRequest,
    svc: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    svc.register_device(user_email, data.expo_push_token, data.platform)
    return {"success": True}


@router.delete("/register", response_model=RegisterDeviceResponse, summary="Unregister an Expo push token (e.g. on logout)")
def unregister_device(
    expo_push_token: str = Query(...),
    svc: NotificationService = Depends(get_notification_service),
    user_email: str = Depends(auth_required),
):
    svc.unregister_device(user_email, expo_push_token)
    return {"success": True}
