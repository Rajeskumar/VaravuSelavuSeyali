import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import Expense, ExpenseComment, GroupMember
from varavu_selavu_service.services.group_service import GroupService


def _to_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class ExpenseCommentService:
    """TS-GRP-126: flat, chronological comments per group expense.

    Comment deletion is deliberately author-only — unlike the any-member-can-edit
    policy for expense numbers (spec §17.2), deleting someone else's comment is a
    different trust surface and isn't covered by that precedent.
    """

    def __init__(self, db: Session):
        self.db = db
        self.group_service = GroupService(db)

    def _get_expense_or_404(self, group_id: uuid.UUID, expense_id: uuid.UUID) -> Expense:
        expense = (
            self.db.query(Expense).filter(Expense.id == expense_id, Expense.group_id == group_id).first()
        )
        if expense is None:
            raise HTTPException(status_code=404, detail="Group expense not found")
        return expense

    def _dto(self, comment: ExpenseComment, member: Optional[GroupMember]) -> Dict:
        return {
            "id": str(comment.id),
            "expense_id": str(comment.expense_id),
            "member_id": str(comment.member_id),
            "author_display_name": member.display_name if member else "Unknown member",
            "body": comment.body,
            "created_at": comment.created_at.isoformat(),
            "edited_at": comment.edited_at.isoformat() if comment.edited_at else None,
        }

    def list_comments(self, group_id: str, expense_id: str, actor_email: str) -> List[Dict]:
        self.group_service.require_membership(group_id, actor_email)
        gid, eid = _to_uuid(group_id), _to_uuid(expense_id)
        self._get_expense_or_404(gid, eid)

        rows = (
            self.db.query(ExpenseComment, GroupMember)
            .join(GroupMember, ExpenseComment.member_id == GroupMember.id)
            .filter(ExpenseComment.expense_id == eid)
            .order_by(ExpenseComment.created_at.asc())
            .all()
        )
        return [self._dto(c, m) for c, m in rows]

    def add_comment(self, group_id: str, expense_id: str, actor_email: str, body: str) -> Dict:
        member = self.group_service.require_membership(group_id, actor_email)
        gid, eid = _to_uuid(group_id), _to_uuid(expense_id)
        self._get_expense_or_404(gid, eid)

        if not body or not body.strip():
            raise HTTPException(status_code=400, detail="Comment body cannot be empty")

        comment = ExpenseComment(id=uuid.uuid4(), expense_id=eid, member_id=member.id, body=body.strip())
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        return self._dto(comment, member)

    def delete_comment(self, group_id: str, expense_id: str, comment_id: str, actor_email: str) -> None:
        member = self.group_service.require_membership(group_id, actor_email)
        gid, eid, cid = _to_uuid(group_id), _to_uuid(expense_id), _to_uuid(comment_id)
        self._get_expense_or_404(gid, eid)

        comment = (
            self.db.query(ExpenseComment).filter(ExpenseComment.id == cid, ExpenseComment.expense_id == eid).first()
        )
        if comment is None:
            raise HTTPException(status_code=404, detail="Comment not found")
        if comment.member_id != member.id:
            raise HTTPException(status_code=403, detail="Only the comment author may delete it")

        self.db.delete(comment)
        self.db.commit()
