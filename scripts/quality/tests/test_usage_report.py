import json
import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import usage_report as ur


def line(**record):
    return json.dumps(record) + "\n"


class UsageReportTests(unittest.TestCase):
    def test_counts_usage_once_per_message_and_every_tool_call(self):
        usage = {"input_tokens": 1, "output_tokens": 10, "cache_read_input_tokens": 100, "cache_creation_input_tokens": 5}
        rows = [
            line(type="assistant", timestamp="2026-11-23T10:00:00Z",
                 message={"id": "m1", "model": "claude-opus-5-5", "usage": usage,
                          "content": [{"type": "tool_use", "id": "t1", "name": "Agent", "input": {"subagent_type": "code-reviewer"}}]}),
            # Same message id, second content block: tool call counted, usage not doubled.
            line(type="assistant", timestamp="2026-11-23T10:01:00Z",
                 message={"id": "m1", "model": "claude-opus-5-5", "usage": usage,
                          "content": [{"type": "tool_use", "id": "t2", "name": "Skill", "input": {"skill": "pr-review"}}]}),
            line(type="user", timestamp="2026-11-23T10:02:00Z",
                 message={"content": [{"type": "tool_result", "tool_use_id": "t1", "content": "x" * 20000}]}),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.jsonl"
            path.write_text("".join(rows))
            data = ur.scan_claude(path)
            sessions = ur.claude_sessions(project_dir=Path(tmp))
        self.assertEqual(data["tokens"]["output_tokens"], 10)
        self.assertEqual(data["agents"], {"code-reviewer": 1})
        self.assertEqual(data["skills"], {"pr-review": 1})
        self.assertEqual(data["large_tool_results"], 1)
        self.assertEqual(data["minutes"], 2.0)
        self.assertEqual(len(sessions), 1)
        self.assertEqual(ur.totals(sessions)["agent_invocations"], {"code-reviewer": 1})

    def test_report_never_contains_content(self):
        secret = "TOP-SECRET-PROMPT"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.jsonl"
            path.write_text(line(type="assistant", timestamp="2026-11-23T10:00:00Z",
                                 message={"id": "m", "content": [{"type": "text", "text": secret}]}))
            self.assertNotIn(secret, json.dumps(ur.claude_sessions(project_dir=Path(tmp))))

    def test_project_dir_encoding(self):
        self.assertTrue(str(ur.claude_project_dir(Path("/a/b_c"))).endswith("-a-b-c"))
