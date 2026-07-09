import re

file_path = "varavu_selavu_service/services/analysis_service.py"
with open(file_path, "r") as f:
    content = f.read()

def replacer(match):
    return """
    def _compute_group_leg(self, user_id, year, month, start_date, end_date, is_sqlite, group_id=None, mode="my_share") -> Dict[str, Any]:
        from varavu_selavu_service.db.models import ExpensePayer, ExpenseSplit, Expense, GroupMember
        
        if mode == "my_share":
            query = (
                self.db.query(ExpenseSplit, Expense)
                .join(GroupMember, GroupMember.id == ExpenseSplit.member_id)
                .join(Expense, Expense.id == ExpenseSplit.expense_id)
                .filter(GroupMember.user_email == user_id)
            )
        elif mode == "i_paid":
            query = (
                self.db.query(ExpensePayer, Expense)
                .join(GroupMember, GroupMember.id == ExpensePayer.member_id)
                .join(Expense, Expense.id == ExpensePayer.expense_id)
                .filter(GroupMember.user_email == user_id)
            )
        elif mode == "group_total":
            user_groups = self.db.query(GroupMember.group_id).filter(GroupMember.user_email == user_id).subquery()
            query = (
                self.db.query(Expense)
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

        # For mode=my_share, we get (ExpenseSplit, Expense)
        # For mode=i_paid, we get (ExpensePayer, Expense)
        # For mode=group_total, we just get Expense, so we map it to (None, Expense)
        if mode == "group_total":
            results = [(None, exp) for exp in query.all()]
        else:
            results = query.all()

        for aux, expense in results:
            row_count += 1
            if mode == "my_share":
                amt = float(aux.amount_owed or 0)
            elif mode == "i_paid":
                amt = float(aux.amount_paid or 0)
            else:
                amt = float(expense.amount or 0)
                
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
content = re.sub(r'    def _compute_group_leg.*?return \{\n.*?"row_count": row_count,\n        \}', replacer, content, flags=re.DOTALL)

with open(file_path, "w") as f:
    f.write(content)
print("Done patching.")
