import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import { fetchWithAuth } from '../api/api';
import { useQueryClient } from '@tanstack/react-query';
import { refreshExpenseViews } from '../utils/expenseEvents';
import PageContainer from '../components/layout/PageContainer';

type Connection = { id: string; client_name: string; scopes: string[]; status: string; expires_at: string };
type Activity = { id: string; event: string; outcome: string; created_at: string };
type Consent = { client_name: string; client_id: string; verified: boolean; scopes: string[] };
type Preview = { description: string; date: string; amount?: string; total?: string; currency: string; merchant?: string; category_id: string; payment_method?: string; notes?: string; tax?: string; tip?: string; discount?: string; items?: { name: string; quantity: string; line_total: string; unit_price?: string; discount?: string; category_id?: string }[] };
type Operation = { connection_name?: string; status: string; approval_revision: number; expires_at: string; preview?: Preview; warnings?: { code: string; expected_total?: string; difference?: string; line?: number }[]; possible_duplicates?: { id: string; date: string; amount: string; currency: string }[] };
const scopeLabels: Record<string, string> = { 'categories:read': 'Read the category catalog (required)', 'expenses:read': 'Read personal expenses and spending summaries', 'expenses:create': 'Prepare personal expenses; every addition needs your approval here' };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`/api/v1/mcp/${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : body.error?.code || 'Unable to complete this request. Try again.');
  return body;
}

export default function AssistantAccessPage({ mode }: { mode: 'manage' | 'connect' | 'approve' }) {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [consent, setConsent] = useState<Consent>();
  const [operation, setOperation] = useState<Operation>();
  const [scopes, setScopes] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (mode === 'manage') {
        const [c, a] = await Promise.all([request<Connection[]>('connections'), request<Activity[]>('activity')]);
        setConnections(c); setActivity(a);
      } else if (mode === 'connect') {
        const c = await request<Consent>(`consent/${id}`); setConsent(c);
        setScopes(c.scopes.filter(s => s !== 'expenses:create'));
      } else {
        const current = await request<Operation>(`approvals/${id}`);
        setOperation(current); setAck(false);
        if (current.status === 'committed') refreshExpenseViews(queryClient);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load request'); }
    finally { setLoading(false); }
  }, [id, mode, queryClient]);
  useEffect(() => { void load(); }, [load]);
  const decide = async (approve: boolean) => {
    setBusy(true); setError('');
    try {
      if (mode === 'connect') {
        const result = await request<{ redirect_url: string }>(`consent/${id}`, { method: 'POST', body: JSON.stringify({ approve, scopes }) });
        // The API supplies only a redirect URI from the validated OAuth request.
        window.location.assign(result.redirect_url);
      } else {
        const result = await request<Operation>(`approvals/${id}`, { method: 'POST', body: JSON.stringify({ approve, approval_revision: operation?.approval_revision, acknowledge_warnings: ack }) });
        setOperation(result);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Decision failed'); }
    finally { setBusy(false); }
  };
  const disconnect = async (cid: string) => {
    setBusy(true);
    try { await request(`connections/${cid}`, { method: 'DELETE' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Disconnect failed'); }
    finally { setBusy(false); }
  };
  const reauth = () => { sessionStorage.setItem('vs_assistant_return', window.location.pathname); };
  const preview = operation?.preview;
  return <PageContainer sx={{ py: 4, maxWidth: 760 }}>
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">{mode === 'manage' ? 'Connected assistants' : mode === 'connect' ? 'Connect an assistant' : 'Review expense'}</Typography>
      <Typography>{mode === 'approve' ? 'Review the personal expense prepared by your assistant. Approving allows it to save these exact details once.' : 'Only personal expenses are available to assistants. Disconnect at any time. Signing out everywhere also disconnects assistants.'}</Typography>
      {loading && <Box role="status" aria-label="Loading assistant access"><CircularProgress /></Box>}
      {error && <Alert severity="error" role="alert">{error}<Stack direction="row" spacing={1}><Button onClick={() => void load()}>Reload</Button><Button component={RouterLink} to="/ai/reauth" onClick={reauth}>Sign in again</Button></Stack></Alert>}
      {!loading && mode === 'manage' && <>
        {connections.length === 0 && <Typography>No connected assistants.</Typography>}
        {connections.map(c => <Paper variant="outlined" key={c.id} sx={{ p: 2 }}><Typography component="h2" variant="h6">{c.client_name}</Typography><Typography>{c.status} · Expires {new Date(c.expires_at).toLocaleDateString()}</Typography>{c.scopes.map(s => <Typography key={s}>{scopeLabels[s] || s}</Typography>)}{c.status === 'active' && <Button disabled={busy} onClick={() => void disconnect(c.id)}>Disconnect {c.client_name}</Button>}</Paper>)}
        <Typography component="h2" variant="h6">Recent activity</Typography>
        {activity.length === 0 && <Typography>No assistant activity yet.</Typography>}
        {activity.map(a => <Typography key={a.id}>{a.event.replace(/[._]/g, ' ')} · {a.outcome} · {new Date(a.created_at).toLocaleString()}</Typography>)}
      </>}
      {!loading && mode === 'connect' && consent && <>
        <Typography component="h2" variant="h6">{consent.client_name}</Typography>
        <Typography sx={{ overflowWrap: 'anywhere' }}>{consent.client_id}</Typography>
        {!consent.verified && <Alert severity="warning">This client name is supplied by its publisher and has not been verified by TrackSpense.</Alert>}
        <Typography>Your selected data will be shared with this assistant and its provider. Review that provider’s privacy policy. Permission expires after 90 days. Expense creation includes limited possible-duplicate details for review.</Typography>
        {consent.scopes.map(s => <FormControlLabel key={s} control={<Checkbox checked={scopes.includes(s)} disabled={s === 'categories:read' || busy} onChange={(_,checked) => setScopes(v => checked ? [...v,s] : v.filter(x => x !== s))} />} label={scopeLabels[s] || s} />)}
        <Stack direction="row" spacing={2}><Button variant="contained" disabled={busy} onClick={() => void decide(true)}>Connect</Button><Button disabled={busy} onClick={() => void decide(false)}>Decline</Button></Stack>
      </>}
      {!loading && mode === 'approve' && operation && <>
        {operation.connection_name && <Typography>Prepared by {operation.connection_name}</Typography>}
        <Alert severity={operation.status === 'committed' ? 'success' : 'info'} role="status">{operation.status === 'approved' ? 'Approved, not saved yet. Return to your assistant and ask it to save this expense.' : operation.status === 'pending_approval' ? 'Review this exact expense before approving. Approval expires ' + new Date(operation.expires_at).toLocaleString() + '.' : operation.status === 'committed' ? 'This expense has been saved.' : `This request is ${operation.status}. It cannot be saved.`}</Alert>
        {preview && <Paper variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}><Stack spacing={1}>
          <Typography component="h2" variant="h6">{preview.description}</Typography>
          <Typography>{preview.amount || preview.total} {preview.currency} · {preview.date}</Typography>
          <Typography>Merchant: {preview.merchant || 'Not supplied'}</Typography><Typography>Category: {preview.category_id.replace(/_/g, ' ').replace('.', ' / ')}</Typography>
          <Typography>Payment method: {preview.payment_method || 'unknown'}</Typography>
          {preview.notes && <Typography>Notes: {preview.notes}</Typography>}
          {preview.items?.map((item,i) => <Typography key={i}>{item.name} · Quantity {item.quantity} · {item.line_total} {preview.currency}{item.unit_price ? ` · Unit price ${item.unit_price}` : ''}{item.discount && item.discount !== '0.00' ? ` · Discount ${item.discount}` : ''}{item.category_id ? ` · Category ${item.category_id.replace(/_/g, ' ').replace('.', ' / ')}` : ''}</Typography>)}
          {preview.items && <Typography>Tax {preview.tax} · Tip {preview.tip} · Discount {preview.discount}</Typography>}
        </Stack></Paper>}
        {operation.possible_duplicates?.map(d => <Alert severity="warning" key={d.id}>Possible duplicate: {d.amount} {d.currency} on {d.date}</Alert>)}
        {operation.warnings?.filter(w => w.code !== 'possible_duplicate' || !operation.possible_duplicates?.length).map((w,i) => <Alert severity="warning" key={i}>{w.code === 'unreconciled_totals' ? `Receipt lines and adjustments total ${w.expected_total}; difference ${w.difference} ${preview?.currency}.` : w.code === 'item_arithmetic' ? `Line ${w.line}: quantity and unit price do not match the line total.` : w.code === 'category_ambiguous' ? 'This category name belongs to more than one category group. Only its name can be stored.' : w.code.replace(/_/g, ' ')}</Alert>)}
        {operation.status === 'pending_approval' && <>
          {!!operation.warnings?.length && <FormControlLabel control={<Checkbox checked={ack} onChange={(_,v) => setAck(v)} />} label="I reviewed the warnings and possible duplicates and still want this expense added." />}
          <Stack direction="row" spacing={2}><Button variant="contained" disabled={busy || (!!operation.warnings?.length && !ack)} onClick={() => void decide(true)}>Approve expense</Button><Button disabled={busy} onClick={() => void decide(false)}>Reject</Button></Stack>
        </>}
        {operation.status === 'approved' && <Button disabled={busy} onClick={() => void decide(false)}>Cancel approval</Button>}
        <Button onClick={() => void load()} disabled={busy}>Refresh status</Button>
      </>}
      <Button component={RouterLink} to="/account">Back to account</Button>
    </Stack>
  </PageContainer>;
}
