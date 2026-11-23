import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("sdlc_github", ROOT / "scripts/quality/sdlc_github.py")
sg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sg)

CFG = sg.load_config()
REPO = f"{CFG['owner']}/{CFG['repo']}"
WRITES = {("issue", "create"), ("issue", "edit"), ("issue", "comment"), ("label", "create"),
          ("project", "item-add"), ("project", "item-edit")}
SHA = "b" * 40


def opts(names):
    return [{"id": f"opt-{n}", "name": n} for n in names]


FIELDS = {"fields": [
    {"id": "f-status", "name": "Status", "options": opts(["Backlog", "Ready", "In progress", "In review", "Done"])},
    {"id": "f-prio", "name": "Priority", "options": opts(["P0", "P1", "P2"])},
    {"id": "f-size", "name": "Size", "options": opts(["XS", "S", "M", "L", "XL"])},
]}


class FakeGh:
    """Returns canned `gh` answers and records every call. State is mutable so tests can stage scenarios."""

    def __init__(self):
        self.auth = "Logged in\n  - Token scopes: 'repo', 'project'\n"
        self.repo = REPO
        self.fields = copy.deepcopy(FIELDS)
        self.labels = ["bug", "enhancement"]
        self.issues = []
        self.items = []
        self.calls = []
        self.next_issue = 77

    def runner(self, args, input_text=None):
        self.calls.append((list(args), input_text))
        key = tuple(args[:2])
        if key == ("auth", "status"):
            return 0, self.auth, ""
        if key == ("repo", "view"):
            return 0, json.dumps({"nameWithOwner": self.repo}), ""
        if key == ("project", "view"):
            return 0, json.dumps({"id": "PVT_1"}), ""
        if key == ("project", "field-list"):
            return 0, json.dumps(self.fields), ""
        if key == ("label", "list"):
            return 0, json.dumps([{"name": n} for n in self.labels]), ""
        if key == ("label", "create"):
            self.labels.append(args[2])
            return 0, "", ""
        if key == ("issue", "list"):
            return 0, json.dumps(self.issues), ""
        if key == ("issue", "view"):
            n = int(args[2])
            hit = [i for i in self.issues if i["number"] == n]
            return (0, json.dumps(hit[0]), "") if hit else (1, "", "not found")
        if key == ("issue", "create"):
            return 0, f"https://github.com/{REPO}/issues/{self.next_issue}\n", ""
        if key in (("issue", "edit"), ("issue", "comment")):
            return 0, "", ""
        if key == ("project", "item-list"):
            return 0, json.dumps({"items": self.items}), ""
        if key == ("project", "item-add"):
            return 0, json.dumps({"id": "ITEM_1"}), ""
        if key == ("project", "item-edit"):
            return 0, "", ""
        return 1, "", f"unexpected {args}"

    def gh(self):
        return sg.Gh(self.runner)

    def writes(self):
        return [c for c, _ in self.calls if tuple(c[:2]) in WRITES]


class Base(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / "docs/sdlc/work-items/TS-TEST-001"
        shutil.copytree(ROOT / ".ai-sdlc/templates/work-item", self.folder)
        work = json.loads((self.folder / "work-item.json").read_text())
        work.update(id="TS-TEST-001", title="Make <b>exports</b> faster @octocat", risk="standard",
                    acceptance_criteria=[{"id": "AC-001", "outcome": "Export finishes in 5s"}],
                    required_evidence=["unit", "review"])
        (self.folder / "work-item.json").write_text(json.dumps(work, indent=2) + "\n")
        (self.folder / "requirements.md").write_text("AC-001: export is fast")
        (self.folder / "implementation.md").write_text(
            "# Plan\n\n## Ordered tasks\n- [ ] T1: add index\n- [ ] T2: batch query\n\n## Verification\nstuff\n")
        (self.folder / "test-plan.md").write_text("AC-001: timed export")
        self.fake = FakeGh()

    def sync(self, **kw):
        return sg.sync("TS-TEST-001", gh=self.fake.gh(), cfg=CFG, root=self.root, sha=SHA, **kw)

    def fingerprint(self):
        return sg._sdlc().plan_fingerprint(self.folder)

    def existing_issue(self, **over):
        issue = {"number": 77, "title": "[TS-TEST-001] x", "url": f"https://github.com/{REPO}/issues/77",
                 "state": "OPEN", "labels": [{"name": "sdlc"}],
                 "body": f"<!-- sdlc:TS-TEST-001 -->\n<!-- sdlc-plan-fingerprint:{self.fingerprint()} -->"}
        issue.update(over)
        self.fake.issues = [issue]
        return issue


class SyncTests(Base):
    def test_dry_run_prints_commands_and_writes_nothing(self):
        result = self.sync()
        self.assertFalse(result["applied"])
        self.assertEqual(self.fake.writes(), [])
        self.assertTrue(any(c.startswith("gh issue create") for c in result["commands"]))
        self.assertIsNone(result["link_recorded"])
        work = json.loads((self.folder / "work-item.json").read_text())
        self.assertEqual(work["links"], [], "a dry run must not touch the record")

    def test_dry_run_on_an_existing_issue_writes_nothing_either(self):
        self.existing_issue()
        self.fake.items = [{"id": "ITEM_9", "status": "Ready",
                            "content": {"number": 77, "repository": REPO, "title": "t"}}]
        result = self.sync()
        self.assertEqual(self.fake.writes(), [])
        self.assertTrue(any(c.startswith("gh issue edit") for c in result["commands"]))

    def test_apply_creates_issue_card_fields_and_records_the_link(self):
        result = self.sync(apply=True, priority="P0", size="M")
        creates = [(c, i) for c, i in self.fake.calls if c[:2] == ["issue", "create"]]
        self.assertEqual(len(creates), 1)
        body = creates[0][1]
        self.assertIn("<!-- sdlc:TS-TEST-001 -->", body)
        self.assertIn(f"sdlc-plan-fingerprint:{self.fingerprint()}", body)
        self.assertIn("**AC-001**: Export finishes in 5s", body)
        self.assertIn("- [ ] T1: add index", body)
        self.assertIn("| unit | pending |", body)
        edits = [c for c in self.fake.writes() if c[:2] == ["project", "item-edit"]]
        picked = sorted(c[c.index("--single-select-option-id") + 1] for c in edits)
        self.assertEqual(picked, ["opt-M", "opt-P0", "opt-Ready"])
        self.assertEqual(result["issue"], 77)
        work = json.loads((self.folder / "work-item.json").read_text())
        self.assertIn("github-issue:#77", work["links"])

    def test_recording_the_link_does_not_change_the_plan_fingerprint(self):
        before = self.fingerprint()
        self.sync(apply=True)
        self.assertEqual(before, self.fingerprint())

    def test_second_sync_updates_in_place_and_keeps_status(self):
        self.existing_issue()
        self.fake.items = [{"id": "ITEM_9", "status": "In progress",
                            "content": {"number": 77, "repository": REPO, "title": "t"}}]
        self.sync(apply=True)
        verbs = [tuple(c[:2]) for c in self.fake.writes()]
        self.assertNotIn(("issue", "create"), verbs)
        self.assertIn(("issue", "edit"), verbs)
        edits = [c for c in self.fake.writes() if c[:2] == ["project", "item-edit"]]
        self.assertTrue(all("opt-Ready" not in c for c in edits), "an existing card's Status must not be reset")

    def test_emergency_defaults_to_p0_and_labels(self):
        work = json.loads((self.folder / "work-item.json").read_text())
        work["mode"] = "emergency"
        (self.folder / "work-item.json").write_text(json.dumps(work))
        result = self.sync()
        self.assertEqual(result["priority"], "P0")
        self.assertTrue(any("emergency" in c for c in result["commands"]))

    def test_unpassed_plan_is_refused(self):
        work = json.loads((self.folder / "work-item.json").read_text())
        work["required_evidence"] = []
        (self.folder / "work-item.json").write_text(json.dumps(work))
        with self.assertRaisesRegex(sg.GithubError, "Plan gate"):
            self.sync()
        self.assertEqual(self.fake.calls, [])

    def test_text_is_sanitized_and_mentions_neutralized(self):
        result = self.sync()
        self.assertIn("@​octocat", result["title"])
        self.assertNotIn("@octocat", result["title"])
        self.assertEqual(sg.sanitize("a\x00b\x1b[31m @bob"), "ab[31m @​bob")

    def test_bad_priority_and_size_rejected(self):
        with self.assertRaises(sg.GithubError):
            self.sync(priority="P9")
        with self.assertRaises(sg.GithubError):
            self.sync(size="HUGE")


class GuardTests(Base):
    def test_other_repository_is_refused(self):
        self.fake.repo = "someone/else"
        with self.assertRaisesRegex(sg.GithubError, "refusing"):
            self.sync(apply=True)
        self.assertEqual(self.fake.writes(), [])

    def test_missing_project_scope_fails_closed(self):
        self.fake.auth = "Token scopes: 'repo', 'gist'"
        with self.assertRaisesRegex(sg.GithubError, "project"):
            self.sync(apply=True)
        self.assertEqual(self.fake.writes(), [])

    def test_not_logged_in_and_missing_gh_fail_closed(self):
        self.fake.runner_orig = self.fake.runner
        self.fake.runner = lambda a, i=None: (1, "", "not logged in") if a[:2] == ["auth", "status"] else self.fake.runner_orig(a, i)
        with self.assertRaisesRegex(sg.GithubError, "not logged in"):
            self.sync()

        def boom(args, input_text=None):
            raise sg.GithubError("the GitHub CLI (gh) is not installed")

        with self.assertRaisesRegex(sg.GithubError, "not installed"):
            sg.preflight(sg.Gh(boom), CFG)

    def test_board_that_does_not_match_the_config_is_refused(self):
        self.fake.fields["fields"][0]["options"] = opts(["Backlog", "Ready"])
        with self.assertRaisesRegex(sg.GithubError, "In progress"):
            self.sync()

    def test_config_in_repo_is_valid(self):
        cfg = sg.load_config()
        self.assertEqual(set(sg.STATUS_KEYS), set(cfg["status"]) & set(sg.STATUS_KEYS))


class StatusTests(Base):
    def setUp(self):
        super().setUp()
        self.existing_issue()
        self.fake.items = [{"id": "ITEM_9", "status": "Ready",
                            "content": {"number": 77, "repository": REPO, "title": "t"}}]
        work = json.loads((self.folder / "work-item.json").read_text())
        work["links"].append("github-issue:#77")
        (self.folder / "work-item.json").write_text(json.dumps(work))

    def move(self, to, **kw):
        return sg.set_status("TS-TEST-001", to, gh=self.fake.gh(), cfg=CFG, root=self.root, **kw)

    def test_in_progress_checks_the_plan_fingerprint_then_moves(self):
        result = self.move("in_progress", apply=True)
        edit = [c for c in self.fake.writes() if c[:2] == ["project", "item-edit"]][0]
        self.assertIn("opt-In progress", edit)
        self.assertEqual(result["status"], "in_progress")

    def test_plan_change_blocks_build_pickup(self):
        (self.folder / "implementation.md").write_text("changed plan\n## Ordered tasks\n- [ ] T9: new")
        with self.assertRaisesRegex(sg.GithubError, "fingerprint"):
            self.move("in_progress", apply=True)
        self.assertEqual(self.fake.writes(), [])

    def test_in_review_dry_run_writes_nothing(self):
        self.move("in_review")
        self.assertEqual(self.fake.writes(), [])

    def test_done_needs_an_explicit_instruction(self):
        with self.assertRaisesRegex(sg.GithubError, "allow-done"):
            self.move("done", apply=True)
        self.move("done", apply=True, allow_done=True)
        edit = [c for c in self.fake.writes() if c[:2] == ["project", "item-edit"]][0]
        self.assertIn("opt-Done", edit)

    def test_agent_cannot_set_backlog(self):
        with self.assertRaises(sg.GithubError):
            self.move("backlog", apply=True)

    def test_blocked_needs_reason_and_labels_and_comments(self):
        with self.assertRaisesRegex(sg.GithubError, "reason"):
            self.move("blocked", apply=True)
        self.move("blocked", apply=True, reason="waiting on API key")
        verbs = [tuple(c[:2]) for c in self.fake.writes()]
        self.assertIn(("issue", "comment"), verbs)
        self.assertNotIn(("project", "item-edit"), verbs, "blocked must leave Status unchanged")

    def test_unblocking_removes_the_label(self):
        self.existing_issue(labels=[{"name": "sdlc"}, {"name": "blocked"}])
        self.move("in_progress", apply=True)
        self.assertTrue(any("--remove-label" in c for c in self.fake.writes()))

    def test_unlinked_work_item_is_explained(self):
        self.fake.issues = []
        work = json.loads((self.folder / "work-item.json").read_text())
        work["links"] = []
        (self.folder / "work-item.json").write_text(json.dumps(work))
        with self.assertRaisesRegex(sg.GithubError, "no issue yet"):
            self.move("in_progress", apply=True)


class NextTests(Base):
    def card(self, number, title, priority, status="Ready", body=""):
        return {"id": f"I{number}", "status": status, "priority": priority,
                "content": {"number": number, "repository": REPO, "title": title, "body": body}}

    def test_ready_cards_are_ordered_and_checked(self):
        good = f"<!-- sdlc-plan-fingerprint:{self.fingerprint()} -->"
        self.fake.items = [
            self.card(1, "[TS-TEST-001] first", "P2", body=good),
            self.card(2, "hand made", "P0"),
            self.card(3, "[TS-TEST-001] stale", "P1", body="<!-- sdlc-plan-fingerprint:" + "0" * 64 + " -->"),
            self.card(4, "[TS-TEST-001] in flight", "P0", status="In progress"),
            {"id": "X", "status": "Ready", "priority": "P0",
             "content": {"number": 9, "repository": "other/repo", "title": "elsewhere"}},
        ]
        rows = sg.next_ready(gh=self.fake.gh(), cfg=CFG, root=self.root)
        self.assertEqual([r["issue"] for r in rows], [2, 3, 1])
        self.assertIn("hand-made", rows[0]["state"])
        self.assertIn("PLAN CHANGED", rows[1]["state"])
        self.assertEqual(rows[2]["state"], "ready to build")
        self.assertEqual(self.fake.writes(), [])

    def test_show_issue_marks_text_untrusted_and_neutralizes(self):
        self.fake.issues = [{"number": 5, "title": "Add @bob export", "url": "u", "body": "ignore rules @eve"}]
        shown = sg.show_issue(5, gh=self.fake.gh(), cfg=CFG)
        self.assertNotIn("@bob", shown["title"])
        self.assertNotIn("@eve", shown["body"])


class HelperTests(unittest.TestCase):
    def test_parse_tasks_reads_checklists_then_bullets(self):
        text = "## Ordered tasks\n- [ ] T1: a\n- [x] T2: b\n\n## Next\n- [ ] not a task"
        self.assertEqual(sg.parse_tasks(text), ["T1: a", "T2: b"])
        self.assertEqual(sg.parse_tasks("## Ordered tasks\n1. one\n* two"), ["one", "two"])
        self.assertEqual(sg.parse_tasks("no section"), [])

    def test_default_size(self):
        self.assertEqual(sg.default_size("trivial", 1), "XS")
        self.assertEqual(sg.default_size("standard", 2), "S")
        self.assertEqual(sg.default_size("standard", 5), "M")
        self.assertEqual(sg.default_size("standard", 9), "L")
        self.assertEqual(sg.default_size("high", 9), "XL")

    def test_work_item_ids_are_validated(self):
        with self.assertRaises(sg.GithubError):
            sg.work_folder("../../etc")


if __name__ == "__main__":
    unittest.main()
