import os
import re
import requests
import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional
from dateutil.relativedelta import relativedelta
from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage

from varavu_selavu_service.models.api_models import ResolvedPeriod, ResolvedScope

logger = logging.getLogger("varavu_selavu.chat_service")

_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


@dataclass
class ChatResult:
    response: str
    resolved_period: ResolvedPeriod
    resolved_scope: ResolvedScope


def _parse_period_from_text(query: str, today: date) -> Optional[tuple[str, str, str]]:
    """
    Deterministic keyword/regex parse of common natural-language period phrases
    (TS-ANL-013). Returns (start_date, end_date, label) as ISO date strings, or
    None if nothing recognizable is found — the caller falls through to
    explicit params, then the current-month default. Not exhaustive by design;
    unrecognized phrasing is not an error, it's just "no phrase found".
    """
    q = query.lower()

    if re.search(r"\blast month\b", q):
        first_of_this_month = today.replace(day=1)
        end = first_of_this_month - relativedelta(days=1)
        start = end.replace(day=1)
        return start.isoformat(), end.isoformat(), start.strftime("%B %Y")

    if re.search(r"\bthis month\b", q):
        start = today.replace(day=1)
        end = (start + relativedelta(months=1)) - relativedelta(days=1)
        return start.isoformat(), end.isoformat(), start.strftime("%B %Y")

    if re.search(r"\blast year\b", q):
        y = today.year - 1
        return date(y, 1, 1).isoformat(), date(y, 12, 31).isoformat(), str(y)

    if re.search(r"\bthis year\b", q):
        return date(today.year, 1, 1).isoformat(), today.isoformat(), str(today.year)

    if re.search(r"\blast quarter\b", q):
        current_q_start_month = ((today.month - 1) // 3) * 3 + 1
        current_q_start = date(today.year, current_q_start_month, 1)
        end = current_q_start - relativedelta(days=1)
        start = end.replace(day=1) - relativedelta(months=2)
        quarter_num = (start.month - 1) // 3 + 1
        return start.isoformat(), end.isoformat(), f"Q{quarter_num} {start.year}"

    m = re.search(r"\b(?:last|past)\s+(\d+)\s+months?\b", q)
    if m:
        n = int(m.group(1))
        start = today - relativedelta(months=n)
        return start.isoformat(), today.isoformat(), f"the last {n} months"

    m = re.search(r"\bsince\s+([a-z]+)\.?\s*(\d{4})?\b", q)
    if m and m.group(1) in _MONTH_NAMES:
        month = _MONTH_NAMES[m.group(1)]
        year = int(m.group(2)) if m.group(2) else today.year
        start = date(year, month, 1)
        return start.isoformat(), today.isoformat(), f"since {start.strftime('%B %Y')}"

    m = re.search(r"\bin\s+([a-z]+)\.?\s*(\d{4})?\b", q)
    if m and m.group(1) in _MONTH_NAMES:
        month = _MONTH_NAMES[m.group(1)]
        year = int(m.group(2)) if m.group(2) else today.year
        # A bare month name with no year, later in the calendar than today,
        # almost always means "last time this month came around" not "in the future".
        if not m.group(2) and month > today.month:
            year -= 1
        start = date(year, month, 1)
        end = (start + relativedelta(months=1)) - relativedelta(days=1)
        return start.isoformat(), end.isoformat(), start.strftime("%B %Y")

    return None


def _resolve_chat_period(
    query_text: str,
    year: int | None,
    month: int | None,
    start_date: str | None,
    end_date: str | None,
) -> ResolvedPeriod:
    """
    Resolves the effective date range for a chat turn using real wall-clock
    time (never left to the LLM to guess "today"). Precedence (TS-ANL-013):
    a recognizable natural-language phrase in the query text > explicit
    start/end date > year/month > the current calendar month (the same
    default used everywhere else in the app — Dashboard/Analysis/Insights —
    replacing this endpoint's previous, inconsistent rolling-3-month default).
    """
    today = date.today()

    parsed = _parse_period_from_text(query_text, today)
    if parsed:
        start, end, label = parsed
        return ResolvedPeriod(start_date=start, end_date=end, label=label, source="parsed_from_query")

    if start_date or end_date:
        eff_start = start_date or (today - relativedelta(months=3)).isoformat()
        eff_end = end_date or today.isoformat()
        return ResolvedPeriod(
            start_date=eff_start, end_date=eff_end,
            label=f"{eff_start} to {eff_end} (custom range)", source="explicit_param",
        )

    if year is not None and month is not None:
        period_start = date(year, month, 1)
        period_end = (period_start + relativedelta(months=1)) - relativedelta(days=1)
        return ResolvedPeriod(
            start_date=period_start.isoformat(), end_date=period_end.isoformat(),
            label=period_start.strftime("%B %Y"), source="explicit_param",
        )

    if year is not None:
        return ResolvedPeriod(
            start_date=date(year, 1, 1).isoformat(), end_date=date(year, 12, 31).isoformat(),
            label=str(year), source="explicit_param",
        )

    # Default: the current calendar month, matching Dashboard/Analysis/Insights.
    start = today.replace(day=1)
    end = (start + relativedelta(months=1)) - relativedelta(days=1)
    return ResolvedPeriod(start_date=start.isoformat(), end_date=end.isoformat(), label=start.strftime("%B %Y"), source="default")


def _resolve_scope_from_text(query: str, user_groups: list[dict]) -> ResolvedScope:
    """
    Matches the query text against the names of groups the caller actually
    belongs to (TS-ANL-013) — case-insensitive substring match, same spirit as
    build_rag_context()'s item/merchant matching. Deliberately conservative:
    generic "I owe"/"split" language that doesn't name a specific group stays
    `personal` rather than guessing which group. `user_groups` must already be
    scoped to the caller (GroupService.list_groups_for_user(email)) — this
    function never sees, and can't leak, another user's group names.
    """
    q_lower = query.lower()
    for g in user_groups:
        name_lower = g["name"].lower()
        if name_lower and name_lower in q_lower:
            return ResolvedScope(kind="group", group_id=str(g["group_id"]), group_name=g["name"])
    return ResolvedScope(kind="personal")


def _fetch_group_balance_summary(
    group_name: str, user_groups: list[dict], balance_service, actor_email: str
) -> str:
    """
    Resolves `group_name` against the caller's own groups (never any other
    user's) and returns their balances, or an explanatory string if no match
    is found. Extracted as a standalone function (TS-ANL-013) so it's directly
    unit-testable without invoking the LangGraph agent/a real LLM — the
    `get_group_balance_summary` tool is a thin wrapper around this.
    """
    try:
        match = next(
            (g for g in user_groups if group_name.lower() in g["name"].lower()), None
        )
        if not match:
            return f"No group found matching: {group_name}"
        balances = balance_service.get_balances(match["group_id"], actor_email)
        return str(balances)
    except Exception as e:
        return f"Error fetching group balances: {str(e)}"


# Mirrors AddExpenseForm.tsx's CATEGORY_GROUPS on the frontend (kept in sync by hand — there's no
# shared source of truth between the two codebases). Categories aren't a DB-enforced enum (any
# string is accepted), but staying within this taxonomy keeps agent-created expenses consistent
# with the rest of the app's category coloring/breakdowns instead of inventing new labels.
_CATEGORY_GUIDE = (
    "Home: Rent, Electronics, Furniture, Household supplies, Maintenance, Mortgage, Pets, Services, Other. "
    "Transportation: Gas/fuel, Car, Parking, Plane, Bicycle, Bus/Train, Taxi, Hotel, Other. "
    "Food & Drink: Groceries, Dining out, Liquor, Other. "
    "Entertainment: Movies, Games, Music, Sports, Other. "
    "Life: Medical expenses, Insurance, Taxes, Education, Childcare, Clothing, Gifts, Other. "
    "Utilities: Heat/gas, Electricity, Water, Cleaning, Trash, TV/Phone/Internet, Other. "
    "Other: Services, General, Electronics."
)


def _create_personal_expense_from_agent(
    expense_service,
    user_id: str,
    description: str,
    amount: float,
    category: str,
    expense_date: Optional[str] = None,
    merchant_name: Optional[str] = None,
) -> str:
    """
    Creates a personal expense on the caller's own behalf. Extracted as a standalone function
    (same pattern as `_fetch_group_balance_summary`) so it's directly unit-testable without
    invoking the LangGraph agent/a real LLM — the `create_expense` tool is a thin wrapper
    around this. Reuses the exact same `ExpenseService.add_expense` the REST
    `POST /api/v1/expenses` endpoint calls, so an agent-created expense is indistinguishable
    from one created through the normal UI.
    """
    if amount is None or amount <= 0:
        return "Error: amount must be a positive number."
    if not description or not description.strip():
        return "Error: a description is required."
    try:
        result = expense_service.add_expense(
            user_id=user_id,
            date=expense_date or date.today().isoformat(),
            description=description.strip(),
            category=category or "General",
            cost=float(amount),
            merchant_name=merchant_name,
        )
        return (
            f'Logged "{result["description"]}" for ${float(amount):.2f} '
            f'({result["category"]}) on {result["date"]}.'
        )
    except Exception as e:
        return f"Error creating expense: {str(e)}"


def _resolve_payer(members: list[dict], my_member: dict, paid_by: Optional[str]) -> tuple[Optional[dict], Optional[str]]:
    """
    Resolves who paid for a group expense from the agent's free-text `paid_by` param — unset
    (or "me"/"myself"/"i") means the caller, otherwise matched against member display names
    (case-insensitive substring, same style as group-name resolution). Returns
    `(payer_member_or_None, error_message_or_None)` — exactly one is non-None.
    """
    if not paid_by or paid_by.strip().lower() in ("me", "myself", "i"):
        return my_member, None
    found = next((m for m in members if paid_by.strip().lower() in m["display_name"].lower()), None)
    if not found:
        names = ", ".join(m["display_name"] for m in members)
        return None, f"No member named '{paid_by}' found in this group. Members are: {names}."
    return found, None


def _create_group_expense_from_agent(
    group_service,
    group_expense_service,
    user_groups: list[dict],
    actor_email: str,
    group_name: str,
    description: str,
    amount: float,
    category: str,
    expense_date: Optional[str] = None,
    merchant_name: Optional[str] = None,
    paid_by: Optional[str] = None,
) -> str:
    """
    Creates a group expense split equally among every current member. Payer defaults to the
    caller (the same default the Quick Capture UI itself uses — see `useLogExpense.ts`'s
    `logToGroup`), or a named member via `paid_by` (see `_resolve_payer`) when the user says
    someone else paid. `group_name` is resolved against the caller's own groups only (never
    another user's), matching `_fetch_group_balance_summary`'s resolution. Extracted standalone
    for the same testability reason as that function.
    """
    if amount is None or amount <= 0:
        return "Error: amount must be a positive number."
    if not description or not description.strip():
        return "Error: a description is required."
    match = next((g for g in user_groups if group_name.lower() in g["name"].lower()), None)
    if not match:
        names = ", ".join(g["name"] for g in user_groups) or "(you have no groups)"
        return f"No group found matching '{group_name}'. Your groups are: {names}."
    try:
        detail = group_service.get_group_detail(match["group_id"], actor_email)
        members = detail.get("members", [])
        my_member = next((m for m in members if m.get("user_email") == actor_email), None)
        if not my_member:
            return f"Error: you don't appear to be an active member of '{detail['name']}'."
        payer, payer_error = _resolve_payer(members, my_member, paid_by)
        if payer_error:
            return payer_error
        # GroupExpenseService.create_expense's `date` is strictly MM/DD/YYYY (unlike
        # ExpenseService.add_expense, which also accepts ISO) — see its `_parse_date`.
        parsed_date = date.fromisoformat(expense_date) if expense_date else date.today()
        mmddyyyy = parsed_date.strftime("%m/%d/%Y")
        result = group_expense_service.create_expense(
            group_id=match["group_id"],
            actor_email=actor_email,
            date=mmddyyyy,
            description=description.strip(),
            category=category or "General",
            amount=float(amount),
            merchant_name=merchant_name,
            payers=[{"member_id": payer["member_id"], "amount_paid": float(amount)}],
            split_type="equal",
            split_entries=[{"member_id": m["member_id"]} for m in members],
        )
        share = float(amount) / max(len(members), 1)
        payer_label = "you" if payer["member_id"] == my_member["member_id"] else payer["display_name"]
        return (
            f'Logged "{description.strip()}" for ${float(amount):.2f} in \'{detail["name"]}\' '
            f"(paid by {payer_label}), split equally among {len(members)} member(s) — "
            f"your share is ${share:.2f}."
        )
    except Exception as e:
        return f"Error creating group expense: {str(e)}"


def _build_group_context_block(user_groups, analysis_service, balance_service, user_id, start_date=None, end_date=None, year=None, month=None) -> dict:
    from varavu_selavu_service.db.models import Expense, GroupMember
    from sqlalchemy import func
    
    if not user_groups or not analysis_service or not balance_service:
        return {}
        
    is_sqlite = analysis_service.db.bind.dialect.name == "sqlite"
    summaries = analysis_service._compute_group_summaries(
        user_id=user_id,
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date,
        is_sqlite=is_sqlite
    )
    
    groups_data = []
    date_filters = analysis_service._date_filters(Expense.purchased_at, year, month, start_date, end_date, is_sqlite)
    
    for g in summaries:
        gid = g["group_id"]
        cats = (
            analysis_service.db.query(Expense.category_id, func.sum(Expense.amount))
            .filter(Expense.group_id == gid)
            .filter(*date_filters)
            .group_by(Expense.category_id)
            .order_by(func.sum(Expense.amount).desc())
            .limit(3)
            .all()
        )
        top_cats = [c[0] or "Uncategorized" for c in cats]
        
        bal_res = balance_service.get_balances(gid, user_id)
        
        my_member = analysis_service.db.query(GroupMember).filter(
            GroupMember.group_id == gid,
            GroupMember.user_email == user_id
        ).first()
        my_mid = str(my_member.id) if my_member else None
        
        balances_with = []
        for m in bal_res.get("members", []):
            if str(m.get("member_id")) != my_mid:
                balances_with.append({
                    "name": m.get("display_name"),
                    "net": m.get("net")
                })
                
        groups_data.append({
            "name": g["name"],
            "my_share": g["my_share"],
            "i_paid": g["i_paid"],
            "group_total": g["group_total"],
            "top_categories": top_cats,
            "balances_with": balances_with
        })
        
    return {"groups": groups_data}


# --------------------------------------------------------------------------- #
# Public API: Agentic Chat Model
# --------------------------------------------------------------------------- #

def call_chat_model(
    messages: list[dict],
    user_id: str,
    analysis_service,
    analytics_service,
    insight_service,
    group_service=None,
    balance_service=None,
    expense_service=None,
    group_expense_service=None,
    groups_enabled: bool = False,
    model: str | None = None,
    provider: str | None = None,
    year: int | None = None,
    month: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> ChatResult:
    """
    Invoke a LangGraph ReAct agent to answer the user's question, using tools
    to dynamically query the database instead of loading everything upfront.
    Also resolves (TS-ANL-013) the concrete time period and personal/group
    scope for this turn and returns them as structured data alongside the
    prose answer, for the "Looked at: ..." UI treatment.
    """

    @tool
    def get_expense_summary(start_date: str = None, end_date: str = None) -> str:
        """Get summary of expenses, totals by category, and top categories. Dates are optional YYYY-MM-DD."""
        try:
            res = analysis_service.analyze(user_id=user_id, start_date=start_date, end_date=end_date, use_cache=False)
            return str(res)
        except Exception as e:
            return f"Error fetching expense summary: {str(e)}"

    @tool
    def get_item_insights(item_name: str, start_date: str = None, end_date: str = None) -> str:
        """Get price metrics and insights for a specific item over a period. Dates are optional YYYY-MM-DD."""
        try:
            res = insight_service.calculate_item_detail(
                user_id=user_id, item_name=item_name, start_date=start_date, end_date=end_date
            )
            return str(res) if res else f"No data found for item: {item_name}"
        except Exception as e:
            return f"Error fetching item insights: {str(e)}"

    @tool
    def get_merchant_insights(merchant_name: str) -> str:
        """Get metrics and spending trends for a specific merchant."""
        try:
            res = analytics_service.get_merchant_detail(user_email=user_id, merchant_name=merchant_name)
            return str(res) if res else f"No data found for merchant: {merchant_name}"
        except Exception as e:
            return f"Error fetching merchant insights: {str(e)}"

    tools = [get_expense_summary, get_item_insights, get_merchant_insights]

    # Create-only for now (TS-CHAT-01x) — deliberately no update/delete tools yet. Those need a
    # search-then-confirm gate (resolve the target expense, show it to the user, get an explicit
    # next-turn "yes") before they're safe to expose to an LLM; create is additive and already as
    # reversible as anything logged through the UI, so it doesn't need that gate.
    if expense_service is not None:
        @tool
        def create_expense(description: str, amount: float, category: str, expense_date: str = None, merchant_name: str = None) -> str:
            """Create/log a new PERSONAL expense (not shared with a group) for the current user.
            Use this whenever the user asks you to log, add, record, or track an expense and does
            not name one of their groups. `amount` is a positive number in dollars. `category`
            should be the closest matching subcategory from the app's taxonomy — see the category
            guide in your system prompt — or 'General' if nothing fits. `expense_date` is optional
            YYYY-MM-DD (defaults to today). `merchant_name` is optional — the store/vendor name if
            the user mentions one (e.g. "coffee at Blue Bottle" -> merchant_name="Blue Bottle"),
            so it's searchable later via merchant insights, not just folded into the description."""
            return _create_personal_expense_from_agent(
                expense_service, user_id, description, amount, category, expense_date, merchant_name
            )

        tools.append(create_expense)

    # Group-name matching + the group-aware tool are only available when Groups
    # is enabled at all (TS-ANL-013) — mirrors how every other group-aware
    # backend path is gated behind settings.GROUPS_ENABLED.
    user_groups: list[dict] = []
    if groups_enabled and group_service is not None:
        try:
            user_groups = group_service.list_groups_for_user(user_id)
        except Exception:
            logger.exception("Failed to list groups for chat scope resolution")
            user_groups = []

    if groups_enabled and group_service is not None and balance_service is not None:
        @tool
        def get_group_balance_summary(group_name: str) -> str:
            """Get who-owes-whom balances for a specific group the user belongs to, by group name."""
            return _fetch_group_balance_summary(group_name, user_groups, balance_service, user_id)
            
        @tool
        def get_group_spend_summary(group_name: str) -> str:
            """Get summary of spending for a specific group, including your share, amount you paid, group total, and top categories."""
            match = next((g for g in user_groups if group_name.lower() in g["name"].lower()), None)
            if not match:
                return f"No group found matching: {group_name}"
            
            try:
                # We can just use the context builder for a single group if we want, or just re-run it
                ctx = _build_group_context_block(
                    [match], analysis_service, balance_service, user_id,
                    start_date=resolved_period.start_date, end_date=resolved_period.end_date,
                    year=year, month=month
                )
                if ctx and ctx.get("groups"):
                    import json
                    return json.dumps(ctx["groups"][0], indent=2)
                return "No spending data found for this group."
            except Exception as e:
                return f"Error fetching group spend summary: {str(e)}"
                
        @tool
        def get_top_group_by_spend() -> str:
            """Find out which group you are spending the most in."""
            try:
                ctx = _build_group_context_block(
                    user_groups, analysis_service, balance_service, user_id,
                    start_date=resolved_period.start_date, end_date=resolved_period.end_date,
                    year=year, month=month
                )
                if ctx and ctx.get("groups"):
                    # Rank by my_share
                    sorted_groups = sorted(ctx["groups"], key=lambda g: g.get("my_share", 0), reverse=True)
                    top_group = sorted_groups[0]
                    return f"You are spending the most in '{top_group['name']}' with your share being ${top_group['my_share']}."
                return "No group spending data available."
            except Exception as e:
                return f"Error fetching top group: {str(e)}"

        tools.extend([get_group_balance_summary, get_group_spend_summary, get_top_group_by_spend])

        if group_expense_service is not None:
            @tool
            def create_group_expense(
                group_name: str, description: str, amount: float, category: str,
                expense_date: str = None, merchant_name: str = None, paid_by: str = None,
            ) -> str:
                """Create/log a new expense split with a specific group, by group name. Use this
                whenever the user asks you to log/add/record/track an expense AND names one of
                their groups (or a synonym close to a group's name). Splits equally among every
                current member. `amount` is a positive number in dollars (the whole
                expense, not any one member's share — the split is computed for you). `category`
                should be the closest matching subcategory from the app's taxonomy — see the
                category guide in your system prompt — or 'General' if nothing fits.
                `merchant_name` is optional — the store/vendor name if mentioned. `paid_by` is
                optional — the display name of the group member who actually paid, if the user
                says someone other than themselves paid (e.g. "Sam paid for pizza" -> paid_by
                ="Sam"); leave unset (or 'me') when the user doesn't say, which defaults to the
                current user as payer. `expense_date` is optional YYYY-MM-DD (defaults to today)."""
                return _create_group_expense_from_agent(
                    group_service, group_expense_service, user_groups, user_id,
                    group_name, description, amount, category, expense_date,
                    merchant_name, paid_by,
                )

            tools.append(create_group_expense)

    # 2. Select Model
    env = os.getenv("ENVIRONMENT") or os.getenv("ENV") or "local"
    if not provider:
        provider = "gemini"
    else:
        provider = provider.lower()
    
    logger.info("Initializing LangGraph agent", extra={"provider": provider, "env": env, "model": model})
    
    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
        
        # We fallback to gpt-4o-mini as it supports tool calling natively
        llm = ChatOpenAI(
            model=model or os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            api_key=api_key,
            temperature=0
        )
    elif provider == "gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
            
        llm = ChatGoogleGenerativeAI(
            model=model or os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            google_api_key=api_key,
            temperature=0
        )
    else:
        # We fallback to llama3 for Ollama local usage
        llm = ChatOllama(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            model=model or os.getenv("OLLAMA_MODEL", "llama3.1"),
            temperature=0
        )
        
    # Only pass the final message to the agent as the current input
    if not messages:
        fallback_period = _resolve_chat_period("", year, month, start_date, end_date)
        return ChatResult(
            response="Please ask a question.",
            resolved_period=fallback_period,
            resolved_scope=ResolvedScope(kind="personal"),
        )

    history_text = ""
    if len(messages) > 1:
        history_text = "\n\nPrevious conversation history:\n"
        for m in messages[:-1]:
            role = "User" if m.get("role") == "user" else "Assistant"
            content = m.get("content", "")
            history_text += f"{role}: {content}\n"

    last_message = messages[-1]
    query_text = last_message.get("content", "")

    # TS-ANL-013: resolve the concrete period and personal/group scope for
    # this turn from the query text itself, before anything else runs, so
    # every other step (RAG context, default summary, the system prompt, and
    # the final structured response) can use the same resolved values.
    resolved_period = _resolve_chat_period(query_text, year, month, start_date, end_date)
    resolved_scope = (
        _resolve_scope_from_text(query_text, user_groups)
        if groups_enabled
        else ResolvedScope(kind="personal")
    )
    scope_text = ""
    intent_is_spend = "vs total" in query_text.lower() or "cost me" in query_text.lower()
    
    if resolved_scope.kind == "group":
        if intent_is_spend:
            scope_text = (
                f"\n\nThis question is about the group \"{resolved_scope.group_name}\" — prefer "
                f"get_group_spend_summary for questions comparing your share vs the group total.\n"
            )
        else:
            scope_text = (
                f"\n\nThis question is about the group \"{resolved_scope.group_name}\" — prefer "
                f"get_group_balance_summary for balance/who-owes-whom questions and "
                f"get_group_spend_summary for spend summary questions about it.\n"
            )
        
    group_context_text = ""
    if groups_enabled and user_groups and group_service is not None and balance_service is not None:
        import json
        try:
            group_ctx = _build_group_context_block(
                user_groups, analysis_service, balance_service, user_id, 
                start_date=resolved_period.start_date, 
                end_date=resolved_period.end_date, 
                year=year, month=month
            )
            if group_ctx.get("groups"):
                group_context_text = (
                    f"\n\nGroup data (automatically fetched):\n"
                    f"{json.dumps(group_ctx, indent=2)}\n"
                    f"Use this data for questions about group spending, your share, or balances instead of guessing.\n"
                    f"If the user asks 'Am I usually the one paying?' or similar, compare i_paid against group_total and member count to provide an interpretative answer.\n"
                )
        except Exception:
            logger.exception("Failed to build group context block")

    # Pre-fetch targeted item/merchant context so the agent starts with the
    # right numbers already in hand instead of having to guess a tool call
    # (see TS-ANL-005: this is the RAG-style context injection).
    rag_context_text = ""
    try:
        rag_context = insight_service.build_rag_context(user_email=user_id, query=query_text)
    except Exception:
        logger.exception("build_rag_context failed; falling back to tool-only context")
        rag_context = None

    if rag_context:
        rag_context_text = (
            f"\n\nRelevant {rag_context['type'].replace('_', ' ')} data for this question "
            f"(already fetched, use it directly instead of calling a tool unless you need more):\n"
            f"{rag_context['data']}\n"
        )

    # Eagerly fetch the expense summary for the resolved period so the model
    # always has concrete numbers in hand, instead of depending on it
    # correctly guessing dates and calling get_expense_summary itself.
    default_summary_text = ""
    try:
        default_summary = analysis_service.analyze(
            user_id=user_id,
            start_date=resolved_period.start_date,
            end_date=resolved_period.end_date,
            use_cache=False,
        )
        default_summary_text = (
            f"\n\nExpense summary for {resolved_period.label} "
            f"({resolved_period.start_date} to {resolved_period.end_date}), "
            f"already fetched — use this directly for any aggregate question unless the user "
            f"asks about a different period, in which case call get_expense_summary again with "
            f"the new dates:\n{default_summary}\n"
        )
    except Exception:
        logger.exception("Failed to pre-fetch default expense summary for chat")

    today_str = date.today().isoformat()
    can_log = expense_service is not None
    logging_guidance = (
        (
            "\n\nYou can also log new expenses on the user's behalf using your create_expense / "
            "create_group_expense tools — do this directly when the user clearly asks you to "
            "log, add, record, or track something (e.g. \"log coffee 6.75 at Blue Bottle\" or "
            "\"add a $40 dinner split with Roommates\"), without asking for confirmation first "
            "(this only creates new expenses — it never updates or deletes existing ones, so "
            "there's nothing to undo-by-mistake). If the amount is genuinely ambiguous or "
            "missing, ask a brief clarifying question instead of guessing. Pass a merchant/vendor "
            "name via `merchant_name` whenever the user mentions one, instead of only folding it "
            "into the description — it's a separate searchable field. For group expenses, pass "
            "`paid_by` when the user says someone other than themselves paid. After creating an "
            "expense, confirm what you logged in one short sentence.\n\n"
            f"Category taxonomy to pick from: {_CATEGORY_GUIDE}\n"
        )
        if can_log
        else ""
    )
    system_prompt = (
        "You are a financial analyst assistant. You help users understand their expenses. "
        f"Today's date is {today_str}. Unless the user specifies a different timeframe, the "
        f"conversation is scoped to {resolved_period.label} "
        f"({resolved_period.start_date} to {resolved_period.end_date}) — the "
        "expense summary for this period is provided below. "
        "Use your tools to query the database for anything not already provided, and answer the "
        "user's questions clearly and concisely. "
        "Format your answer using markdown. "
    ) + logging_guidance + default_summary_text + rag_context_text + group_context_text + scope_text + history_text

    agent = create_react_agent(llm, tools, prompt=system_prompt)

    lc_messages = [HumanMessage(content=query_text)]

    def _result(response_text: str) -> ChatResult:
        return ChatResult(response=response_text, resolved_period=resolved_period, resolved_scope=resolved_scope)

    try:
        final_message = None
        # Stream intermediate steps to see exactly what Gemini returns
        logger.info(f"Starting agent execution with model {model} and provider {provider}...")
        for event in agent.stream({"messages": lc_messages}):
            for node_name, node_output in event.items():
                logger.info(f"Agent step [{node_name}]: {node_output}")
                if "messages" in node_output:
                    final_message = node_output["messages"][-1]

        if final_message is None:
            raise ValueError("Agent returned no messages")

        # Check for Gemini tool calling failures
        finish_reason = final_message.response_metadata.get('finish_reason') if getattr(final_message, 'response_metadata', None) else None
        if finish_reason == 'MALFORMED_FUNCTION_CALL':
            return _result("I encountered a technical issue while analyzing your data (Malformed Function Call). Please try rephrasing your question or selecting the 'gemini-2.5-pro' model, which handles complex queries better.")

        content = final_message.content
        if not content and not getattr(final_message, 'tool_calls', []):
             return _result("I couldn't generate a response. Please try again or switch to a different model.")

        if isinstance(content, list):
            text_parts = [chunk.get("text", "") if isinstance(chunk, dict) else str(chunk) for chunk in content]
            return _result("".join(text_parts))
        return _result(str(content))
    except Exception as e:
        logger.exception("Agent execution failed", extra={"error": str(e)})
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")


# --------------------------------------------------------------------------- #
# Model listing helpers
# --------------------------------------------------------------------------- #

def list_openai_models() -> list[str]:
    """
    Return a list of model IDs from OpenAI's Models API, filtered to
    gpt-4o, gpt-4o-mini, gpt-5, gpt-5.2, and gpt-5-mini (if they exist).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
    try:
        resp = requests.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        remote_ids = {m.get("id") for m in data.get("data", []) if m.get("id")}

        # Only include these models if they are returned by the API
        target_models = ["gpt-5-mini", "gpt-5.2", "gpt-5", "gpt-4o-mini", "gpt-4o"]

        filtered_ids = [mid for mid in target_models if mid in remote_ids]
        return filtered_ids
    except requests.RequestException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        text = getattr(getattr(exc, "response", None), "text", None)
        logger.exception(
            "OpenAI model listing failed",
            extra={"provider": "openai", "status": status, "response": text},
        )
        raise HTTPException(status_code=502, detail=f"Error listing OpenAI models: {exc}")


def list_ollama_models() -> list[str]:
    """Return a list of local Ollama model names (from /api/tags)."""
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    url = f"{ollama_base_url.rstrip('/')}/api/tags"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return [m.get("name") for m in data.get("models", []) if m.get("name")]
    except requests.RequestException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        text = getattr(getattr(exc, "response", None), "text", None)
        logger.exception(
            "Ollama model listing failed",
            extra={"provider": "ollama", "url": url, "status": status, "response": text},
        )
        raise HTTPException(status_code=502, detail=f"Error listing Ollama models: {exc}")

def list_gemini_models() -> list[str]:
    """Return a list of available Gemini models via the API."""
    api_key = os.getenv("GEMINI_API_KEY")
    default_models = ["gemini-2.5-flash", "gemini-2.5-pro"]
    
    if not api_key:
        return default_models
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        models = []
        for m in data.get("models", []):
            name = m.get("name", "")
            if name.startswith("models/"):
                name = name[7:]
            if name in ["gemini-2.5-flash", "gemini-2.5-pro"]:
                models.append(name)
        return models if models else default_models
    except Exception as exc:
        logger.exception("Gemini model listing failed", extra={"error": str(exc)})
        return default_models
