from fastapi import APIRouter
from sqlalchemy import select, update

from ..auth import DB, CurrentUser
from ..models import Notification
from .. import schemas as S

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[S.NotificationOut])
def list_notifications(user: CurrentUser, db: DB):
    return db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(50)).all()


@router.post("/read", status_code=204)
def mark_read(body: S.MarkReadIn, user: CurrentUser, db: DB):
    stmt = update(Notification).where(Notification.user_id == user.id)  # users can only touch their own rows
    if not body.all:
        if not body.ids:
            return
        stmt = stmt.where(Notification.id.in_(body.ids))
    db.execute(stmt.values(read=True))
    db.commit()
