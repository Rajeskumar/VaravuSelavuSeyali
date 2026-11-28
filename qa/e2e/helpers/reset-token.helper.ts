import { execFileSync } from 'child_process';
import * as path from 'path';

const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..', 'varavu_selavu_app');
const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'issue_qa_reset_token.py');

/** Stands in for the emailed reset link (QA has no SMTP). Local QA database only. */
export function issueResetToken(email: string): string {
  const out = execFileSync('poetry', ['run', 'python', SCRIPT, email], { cwd: BACKEND_DIR, env: process.env, encoding: 'utf8' });
  return out.trim().split('\n').pop() as string;
}
