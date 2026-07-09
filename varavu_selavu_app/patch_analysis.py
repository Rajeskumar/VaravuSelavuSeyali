import re

file_path = "varavu_selavu_service/services/analysis_service.py"
with open(file_path, "r") as f:
    content = f.read()

# Replace _compute_share_leg with _compute_group_leg
def replacer(match):
    return """
    def _compute_group_leg(self, user_id, year, month, start_date, end_date, is_sqlite, group_id=None, mode="my_share") -> Dict[str, Any]:
        if mode == "my_share":
            query = (
                self.db.query(ExpenseSplit, Expense)
                .join(GroupMember, GroupMember.id == ExpenseSplit.member_id)
                .join(Expense, Expense.id == ExpenseSplit.expense_id)
                .filter(GroupMember.user_email == user_id)
            )
        elif mode == "i_paid":
            query = (
                self.db.query(ExpenseSplit, Expense) # dummy ExpenseSplit to match loop
                .join(GroupMember, GroupMember.id == Expense.payer_id)
                .filter(GroupMember.user_email == user_id)
            )
        elif mode == "group_total":
            user_groups = self.db.query(GroupMember.group_id).filter(GroupMember.user_email == user_id).subquery()
            query = (
                self.db.query(ExpenseSplit, Expense) # dummy ExpenseSplit to match loop
                .filter(Expense.group_id.in_(user_groups))
            )
        
        if group_id:
            gid = _to_uuid(group_id)
            if gid is not None:
                query = query.filter(Expense.group_id == gid)
        elif mode in ("i_paid", "group_total"):
            query = query.filter(Expense.group_id.isnot(None))
            
        query = query.filter(*self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite))

        category_sums = {}
        month_sums = {}
        details = {}
        total = 0.0
        row_count = 0

        # For mode=my_share, we need ExpenseSplit. For others, we just need Expense, so we can conditionally query
        if mode == "my_share":
            results = query.all()
        else:
            # Rebuild query to only select Expense
            if mode == "i_paid":
                q = self.db.query(Expense).join(GroupMember, GroupMember.id == Expense.payer_id).filter(GroupMember.user_email == user_id)
            else:
                user_groups = self.db.query(GroupMember.group_id).filter(GroupMember.user_email == user_id).subquery()
                q = self.db.query(Expense).filter(Expense.group_id.in_(user_groups))
            
            if group_id:
                gid = _to_uuid(group_id)
                if gid is not None:
                    q = q.filter(Expense.group_id == gid)
            else:
                q = q.filter(Expense.group_id.isnot(None))
            q = q.filter(*self._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite))
            results = [(None, exp) for exp in q.all()]

        for split, expense in results:
            row_count += 1
            if mode == "my_share":
                amt = float(split.amount_owed or 0)
            else:
                amt = float(expense.cost or 0)
                
            cat_name = expense.category_id or "Uncategorized"
            total += amt
            category_sums[cat_name] = category_sums.get(cat_name, 0.0) + amt

            dt_str = ""
            if expense.purchased_at:
                month_key = expense.purchased_at.strftime("%Y-%m")
                month_sums[month_key] = month_sums.get(month_key, 0.0) + amt
                dt_str = expense.purchased_at.strftime("%Y-%m-%d")

            details.setdefault(cat_name, []).append({
                "date": dt_str,
                "description": expense.description or "",
                "category": cat_name,
                "cost": amt,
            })

        category_totals = [{"category": k, "total": v} for k, v in sorted(category_sums.items(), key=lambda kv: -kv[1])]
        monthly_trend = [{"month": k, "total": v} for k, v in sorted(month_sums.items())]

        return {
            "category_totals": category_totals,
            "monthly_trend": monthly_trend,
            "total": total,
            "category_expense_details": details,
            "row_count": row_count,
        }
"""
content = re.sub(r'    def _compute_share_leg.*?return \{\n.*?"row_count": row_count,\n        \}', replacer, content, flags=re.DOTALL)

# Now fix the get_analysis part
def get_analysis_replacer(match):
    return """
        personal_leg = None
        group_leg = None
        if scope in ("personal", "combined", "i_paid", "group_total"):
            personal_leg = self._compute_personal_leg(user_id, year, month, start_date, end_date, is_sqlite)
        if scope in ("combined", "groups"):
            group_leg = self._compute_group_leg(user_id, year, month, start_date, end_date, is_sqlite, group_id, "my_share")
        elif scope == "i_paid":
            group_leg = self._compute_group_leg(user_id, year, month, start_date, end_date, is_sqlite, group_id, "i_paid")
        elif scope == "group_total":
            group_leg = self._compute_group_leg(user_id, year, month, start_date, end_date, is_sqlite, group_id, "group_total")

        if scope == "groups":
            merged = group_leg
        elif scope in ("combined", "i_paid", "group_total"):
            merged = self._merge_legs(personal_leg, group_leg)
        else:
            merged = personal_leg
"""

content = re.sub(r'        personal_leg = None\n.*?merged = personal_leg', get_analysis_replacer, content, flags=re.DOTALL)

def spend_breakdown_replacer(match):
    return """
        if scope in ("combined", "groups", "i_paid", "group_total"):
            result["spend_breakdown"] = {
                "personal": round(personal_leg["total"], 2) if personal_leg else 0.0,
                "group_share": round(group_leg["total"] if group_leg else 0.0, 2),
            }
"""

content = re.sub(r'        if scope in \("combined", "groups"\):\n            result\["spend_breakdown"\] = \{\n                "personal": round\(personal_leg\["total"\], 2\) if personal_leg else 0\.0,\n                "group_share": round\(share_leg\["total"\], 2\),\n            \}', spend_breakdown_replacer, content, flags=re.DOTALL)

with open(file_path, "w") as f:
    f.write(content)

routes_path = "varavu_selavu_service/api/routes.py"
with open(routes_path, "r") as f:
    routes_content = f.read()

routes_content = routes_content.replace(
    'scope: str = Query(default="personal", pattern="^(personal|combined|groups)$")',
    'scope: str = Query(default="personal", pattern="^(personal|combined|groups|i_paid|group_total)$")'
).replace(
    'scope: str = Query(default="combined", pattern="^(personal|combined|groups)$")',
    'scope: str = Query(default="combined", pattern="^(personal|combined|groups|i_paid|group_total)$")'
)

with open(routes_path, "w") as f:
    f.write(routes_content)

print("Done patching.")
