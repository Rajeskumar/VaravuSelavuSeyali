import os
from typing import Optional
import os

import gspread
from google.auth import default as google_auth_default


SERVICE_ACCOUNT_FILE = "gold-circlet-424313-r7-fe875b4862e6.json"
SPREADSHEET_NAME = "MyExpenses"


class GoogleSheetsClient:
    """Creates and caches a gspread client and common worksheets."""

    def __init__(self):
        self._gc: Optional[gspread.Client] = None
        self._sh: Optional[gspread.Spreadsheet] = None

    def _create_client(self) -> gspread.Client:
        # If running on GCP (Cloud Run/App Engine), use default credentials
        if "K_SERVICE" in os.environ:
            credentials, _ = google_auth_default()
            return gspread.authorize(credentials)

        # If GOOGLE_APPLICATION_CREDENTIALS is set, let gspread pick it up
        if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            return gspread.service_account()

        # Fallback to service account json in repo root
        # This file exists at repo root as used by the previous Streamlit implementation
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        cred_path = os.path.join(repo_root, SERVICE_ACCOUNT_FILE)
        if not os.path.exists(cred_path):
            raise FileNotFoundError(
                f"Service account JSON not found. Expected at {cred_path}. "
                "Set GOOGLE_APPLICATION_CREDENTIALS or deploy with default credentials."
            )
        return gspread.service_account(filename=cred_path)

    @property
    def gc(self) -> gspread.Client:
        if self._gc is None:
            self._gc = self._create_client()
        return self._gc

    @property
    def spreadsheet(self) -> gspread.Spreadsheet:
        if self._sh is None:
            sheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")
            if sheet_id:
                self._sh = self.gc.open_by_key(sheet_id)
            else:
                self._sh = self.gc.open(SPREADSHEET_NAME)
        return self._sh

    def main_worksheet(self) -> gspread.Worksheet:
        # The first worksheet holds expenses per prior implementation
        return self.spreadsheet.sheet1

    def user_data_sheet(self) -> gspread.Worksheet:
        """Retrieve or create the `user_data` worksheet used for user accounts."""
        try:
            return self.spreadsheet.worksheet("user_data")
        except gspread.exceptions.WorksheetNotFound:
            # legacy sheet may not exist on a fresh spreadsheet
            ws = self.spreadsheet.add_worksheet(title="user_data", rows="100", cols="4")
            ws.append_row(["name", "phone", "email", "password"])
            return ws

    def recurring_sheet(self) -> gspread.Worksheet:
        """Retrieve or create the `recurring` worksheet used for recurring templates.

        Columns:
        - user_id
        - description
        - category
        - day_of_month
        - default_cost
        - start_date_iso (YYYY-MM-DD)
        - last_processed_iso (YYYY-MM-DD or empty)
        - template_id (stable id string)
        """
        try:
            ws = self.spreadsheet.worksheet("recurring")
            # Check for missing headers (schema migration)
            try:
                headers = ws.row_values(1)
                if "status" not in headers:
                    # Append "status" column header
                    col_idx = len(headers) + 1
                    ws.update_cell(1, col_idx, "status")
                    # If "paused" existed, we might want to migrate data, but for now just add status
            except Exception:
                pass  # validation failed or sheet empty, ignore
            return ws
        except gspread.exceptions.WorksheetNotFound:
            ws = self.spreadsheet.add_worksheet(title="recurring", rows="500", cols="9")
            ws.append_row([
                "user_id",
                "description",
                "category",
                "day_of_month",
                "default_cost",
                "start_date_iso",
                "last_processed_iso",
                "template_id",
                "status",
            ])
            return ws
