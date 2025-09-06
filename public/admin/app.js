function Outbox() {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);

  const fetchPage = async (off = offset, lim = limit) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/outbox?offset=${off}&limit=${lim}`);
      const j = await res.json();
      setItems(j.items || []);
      setOffset(j.offset || 0);
      setLimit(j.limit || 20);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPage(0, limit); }, []);

  const next = () => fetchPage(offset + limit, limit);
  const prev = () => fetchPage(Math.max(0, offset - limit), limit);

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Outbox</h2>
        <div className="btnbar" style={{alignItems:'center'}}>
          <label className="small">Page Size</label>
          <select value={limit} onChange={(e)=>fetchPage(0, Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <button className={`secondary ${loading?'loading':''}`} onClick={()=>fetchPage(offset, limit)} disabled={loading}>Refresh</button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="small">No sent emails yet.</div>
      )}

      {items.map((m, i) => (
        <div key={i} className="card" style={{marginTop:12}}>
          <div className="row">
            <div className="col">
              <div className="small">To</div>
              <div>{Array.isArray(m.to) ? m.to.join(', ') : m.to}</div>
            </div>
            <div className="col">
              <div className="small">Subject</div>
              <div>{m.subject}</div>
            </div>
            <div className="col">
              <div className="small">Sent</div>
              <div className="small">{m.sentAt ? new Date(m.sentAt).toLocaleString() : ''}</div>
            </div>
            <div className="col">
              <div className="small">Rule</div>
              <span className={`badge ${m.section ? 'success' : 'secondary'}`}>{m.section || '—'}</span>
            </div>
          </div>
          <details style={{marginTop:8}}>
            <summary className="small">Preview</summary>
            <div style={{marginTop:8}} dangerouslySetInnerHTML={{ __html: m.html }} />
          </details>
        </div>
      ))}

      <div className="btnbar" style={{justifyContent:'space-between',marginTop:12}}>
        <button className="secondary" onClick={prev} disabled={loading || offset===0}>Prev</button>
        <div className="small">Offset {offset} • Showing {items.length}</div>
        <button onClick={next} disabled={loading || items.length < limit}>Next</button>
      </div>
    </div>
  );
}
const { useState, useEffect } = React;

function Tabs({ tab, setTab }) {
  const tabs = ['Profile', 'Tester', 'Queue', 'Rules', 'Outbox', 'Logs'];
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

// Sections management UI (rules for keyword-based behavior)
function Sections() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch('/api/settings').then(r=>r.json()).then((s)=>{
      // Initialize keywordsText for UX
      const secs = Array.isArray(s.sections) ? s.sections.map(sec => ({
        ...sec,
        keywordsText: Array.isArray(sec.keywords) ? sec.keywords.join(', ') : (sec.keywordsText || ''),
      })) : [];
      setSettings({ ...s, sections: secs });
      setIdx(0);
    });
  }, []);

  if (!settings) return <div className="card">Loading…</div>;

  const sections = Array.isArray(settings.sections) ? settings.sections : [];

  const updateSection = (idx, patch) => {
    const next = sections.map((s,i)=> i===idx ? { ...s, ...patch } : s);
    setSettings(s=>({ ...s, sections: next }));
  };
  const removeSection = (i) => {
    const next = sections.filter((_,j)=>j!==i);
    setSettings(s=>({ ...s, sections: next }));
    setIdx(Math.max(0, i-1));
  };
  const addSection = () => {
    const next = sections.concat([{ name:'', keywords:[], priority:0, instructions:'', enabled: true }]);
    setSettings(s=>({ ...s, sections: next }));
    setIdx(next.length - 1);
  };
  const save = async () => {
    setSaving(true);
    // Derive clean keywords array from keywordsText before saving
    const clean = {
      ...settings,
      sections: sections.map(sec => ({
        name: sec.name || '',
        priority: Number(sec.priority || 0),
        enabled: sec.enabled !== false,
        instructions: sec.instructions || '',
        delaySeconds: Number(sec.delaySeconds || 0),
        keywords: (sec.keywordsText || (Array.isArray(sec.keywords)? sec.keywords.join(', '):''))
          .split(',')
          .map(s=>s.trim())
          .filter(Boolean),
      })),
    };
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean) });
    const json = await res.json();
    // Rehydrate keywordsText for continued editing UX
    const secs = Array.isArray(json.sections) ? json.sections.map(sec => ({ ...sec, keywordsText: (sec.keywords||[]).join(', ') })) : [];
    setSettings({ ...json, sections: secs });
    setSaving(false);
    setJustSaved(true);
    setTimeout(()=>setJustSaved(false), 1600);
  };

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Rules</h2>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button className="secondary" onClick={addSection}>Add Rule</button>
          <button onClick={()=>save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          {justSaved && <span className="badge success flash">Saved</span>}
        </div>
      </div>

      {/* Rule tabs */}
      <div className="tabbar" style={{marginTop:8}}>
        {sections.map((s, i) => (
          <div key={i} className={`tab ${i===idx ? 'active' : ''}`} onClick={()=>setIdx(i)}>
            <span style={{maxWidth:180, overflow:'hidden', textOverflow:'ellipsis'}}>{s.name || `Rule ${i+1}`}</span>
            <button className="close" title="Close" onClick={(e)=>{ e.stopPropagation(); if (sections.length>1) removeSection(i); }}>&times;</button>
          </div>
        ))}
        <div className="tab add" title="New Rule" onClick={addSection}>+ New</div>
      </div>

      {sections.length === 0 && (<div className="small">No rules yet. Click "Add Rule" to create your first one.</div>)}

      {sections.length > 0 && (()=>{
        const sec = sections[idx] || {};
        return (
          <div className="card" style={{marginTop:12}}>
            <div className="row">
              <div className="col">
                <label>Name</label>
                <input value={sec.name||''} onChange={e=>updateSection(idx,{ name: e.target.value })} placeholder="Repairs" />
              </div>
              <div className="col">
                <label>Priority</label>
                <input type="number" value={Number(sec.priority||0)} onChange={e=>updateSection(idx,{ priority: Number(e.target.value) })} />
              </div>
              <div className="col">
                <label className="small" style={{opacity:0.9}}>Enabled</label>
                <div className="controls">
                  <input className="bigcheck" type="checkbox" checked={sec.enabled !== false} onChange={e=>updateSection(idx,{ enabled: e.target.checked })} />
                  <span className={`badge indicator ${sec.enabled !== false ? 'success' : 'danger'}`}>{sec.enabled !== false ? 'ON' : 'OFF'}</span>
                </div>
              </div>
              <div className="col">
                <label>Delay (seconds)</label>
                <input type="number" value={Number(sec.delaySeconds||0)} onChange={e=>updateSection(idx,{ delaySeconds: Number(e.target.value) })} placeholder="e.g. 120" />
              </div>
            </div>
            <div className="row">
              <div className="col">
                <label>Keywords (comma-separated)</label>
                <input
                  value={sec.keywordsText||''}
                  onChange={e=>updateSection(idx,{ keywordsText: e.target.value })}
                  placeholder="repair, broken, fix"
                />
              </div>
            </div>
            <div className="row">
              <div className="col">
                <label>Instructions</label>
                <textarea value={sec.instructions||''} onChange={e=>updateSection(idx,{ instructions: e.target.value })} placeholder="What should AI do when this rule matches?" />
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button className="danger" onClick={()=>removeSection(idx)}>Delete</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Logs component: fetches /api/logs and displays a table
function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/logs?limit=200');
      const j = await res.json();
      setLogs(Array.isArray(j.logs) ? j.logs : []);
    } catch (e) {
      console.error('fetch logs error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Logs</h2>
        <button className="secondary" onClick={fetchLogs}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Time</th><th>Type</th><th>Data</th></tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i}>
                <td className="small">{l.ts ? new Date(l.ts).toLocaleString() : ''}</td>
                <td>{l.type}</td>
                <td className="small"><pre style={{whiteSpace:'pre-wrap',margin:0}}>{JSON.stringify(l.data, null, 2)}</pre></td>
              </tr>
            ))}
            {logs.length === 0 && (<tr><td className="small" colSpan="3">No logs yet.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Profile() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState(''); // 'enable' | 'disable' | ''
  const [justSaved, setJustSaved] = useState(false);
  const [showPw, setShowPw] = useState(false);
  useEffect(() => {
    fetch('/api/settings').then(r=>r.json()).then(setSettings);
  }, []);
  if (!settings) return <div className="card">Loading…</div>;
  const update = (k,v)=> setSettings(s=>({ ...s, [k]: v }));
  const save = async (payload) => {
    setSaving(true);
    const body = JSON.stringify(payload || settings);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const json = await res.json();
    setSettings(json); setSaving(false); setSavingAction('');
    setJustSaved(true);
    setTimeout(()=>setJustSaved(false), 1600);
  };
  const handleEnable = async () => {
    const next = { ...settings, enableAutoResponder: true };
    setSettings(next);
    setSavingAction('enable');
    await save(next);
  };
  const handleDisable = async () => {
    const next = { ...settings, enableAutoResponder: false };
    setSettings(next);
    setSavingAction('disable');
    await save(next);
  };
  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>AI Replies Settings</h2>
        <div className="controls">
          <label className="small" style={{opacity:0.9}}>Auto-Responder</label>
          <input className="bigcheck" type="checkbox" checked={!!settings.enableAutoResponder} onChange={async (e)=>{
            const next = { ...settings, enableAutoResponder: e.target.checked };
            setSettings(next);
            setSavingAction(e.target.checked ? 'enable' : 'disable');
            await save(next);
          }} />
          <span className={`badge indicator ${settings.enableAutoResponder ? 'success' : 'danger'}`}>
            {settings.enableAutoResponder ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>
      <div className="row">
        <div className="col">
          <label>From Email</label>
          <input value={settings.fromEmail||''} onChange={e=>update('fromEmail', e.target.value)} placeholder="replies@yourdomain.com" />
        </div>
        <div className="col">
          <label>Default Delay (seconds)</label>
          <input type="number" value={Number(settings.defaultDelaySeconds||0)} onChange={e=>update('defaultDelaySeconds', Number(e.target.value))} placeholder="e.g. 120" />
        </div>
      </div>

      <div className="row">
        <div className="col">
          <label>Admin Password (stored in settings)</label>
          <div className="input-group">
            <input type={showPw ? 'text' : 'password'} value={settings.adminPassword||''} onChange={e=>update('adminPassword', e.target.value)} placeholder="Set an admin password" autoComplete="new-password" />
            <button type="button" className="right-btn" onClick={()=>setShowPw(s=>!s)} title={showPw?'Hide':'Show'}>{showPw?'🙈':'👁️'}</button>
          </div>
          <div className="small muted" style={{marginTop:4}}>Minimal security: stored in DB as plain text for now.</div>
        </div>
      </div>

      <div className="row">
        <div className="col">
          <label>System Instructions</label>
          <textarea value={settings.systemInstructions||''} onChange={e=>update('systemInstructions', e.target.value)} placeholder="Keep emails brief, human, 1-2 sentences…" />
        </div>
      </div>

      <div className="row">
        <div className="col">
          <label>Tone</label>
          <input value={settings.tone||''} onChange={e=>update('tone', e.target.value)} />
        </div>
        <div className="col">
          <label>Max Sentences</label>
          <input type="number" value={settings.maxSentences||2} onChange={e=>update('maxSentences', Number(e.target.value))} />
        </div>
      </div>

      <div className="row">
        <div className="col">
          <label>Subject</label>
          <input value={settings.subject||''} onChange={e=>update('subject', e.target.value)} />
        </div>
      </div>

      <div className="row">
        <div className="col">
          <label>Signature</label>
          <input value={settings.signature||''} onChange={e=>update('signature', e.target.value)} placeholder="—Your Name, Business" />
        </div>
      </div>

      <div style={{display:'flex', gap:8, alignItems:'center', marginTop:12}}>
        <button onClick={()=>save()} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        {justSaved && <span className="badge success flash">Saved</span>}
      </div>
    </div>
  );
}

function Tester() {
  // Multiple scenarios persisted to localStorage
  const STORAGE_KEY = 'air:testers:v1';
  const emptyForm = { name: '', email: '', subject: '', message: '' };
  const [scenarios, setScenarios] = useState([{ id: String(Date.now()), name: 'Draft 1', form: { ...emptyForm } }]);
  const [idx, setIdx] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          setScenarios(arr);
          setIdx(0);
        }
      }
    } catch {}
  }, []);

  // Save to localStorage on change
  const persist = (arr) => {
    setScenarios(arr);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
  };

  const current = scenarios[idx] || scenarios[0];
  const updateForm = (k, v) => {
    const next = scenarios.map((s, i) => i === idx ? { ...s, form: { ...s.form, [k]: v } } : s);
    persist(next);
  };
  const rename = (v) => {
    const next = scenarios.map((s, i) => i === idx ? { ...s, name: v } : s);
    persist(next);
  };
  const addScenario = () => {
    const next = scenarios.concat([{ id: String(Date.now()), name: `Draft ${scenarios.length + 1}`, form: { ...emptyForm } }]);
    persist(next);
    setIdx(next.length - 1);
  };
  const duplicate = () => {
    const s = scenarios[idx];
    const copy = { id: String(Date.now()), name: s.name + ' (copy)', form: { ...s.form }, preview: s.preview ? { ...s.preview } : undefined };
    const next = scenarios.concat([copy]);
    persist(next);
    setIdx(next.length - 1);
  };
  const remove = () => {
    if (scenarios.length <= 1) return;
    const next = scenarios.filter((_, i) => i !== idx);
    persist(next);
    setIdx(Math.max(0, idx - 1));
  };

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tester', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(current.form) });
      const json = await res.json();
      const next = scenarios.map((s, i) => i === idx ? { ...s, preview: json } : s);
      persist(next);
    } finally {
      setLoading(false);
    }
  };
  const sendNow = async () => {
    await fetch('/intake', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(current.form) });
    await fetch('/api/worker/run', { method:'POST' });
    alert('Sent: queued and worker triggered. Check your inbox and Logs.');
  };

  return (
    <div className="card">
      <h2 style={{marginBottom:8}}>Tester</h2>
      <div className="tabbar" style={{marginBottom:8}}>
        {scenarios.map((s, i) => (
          <div key={s.id} className={`tab ${i===idx ? 'active' : ''}`} onClick={()=>setIdx(i)}>
            <span style={{maxWidth:180, overflow:'hidden', textOverflow:'ellipsis'}}>{s.name}</span>
            <button className="close" title="Close" onClick={(e)=>{ e.stopPropagation(); if (scenarios.length>1) { const next = scenarios.filter((_, j)=>j!==i); persist(next); setIdx(Math.max(0, i-1)); }}}>&times;</button>
          </div>
        ))}
        <div className="tab add" title="New Tab" onClick={addScenario}>+ New</div>
        <div style={{marginLeft:'auto', display:'flex', gap:6}}>
          <button className="secondary" title="Duplicate current" onClick={duplicate}>Duplicate</button>
        </div>
      </div>

      <div className="row" style={{marginTop:8}}>
        <div className="col"><label>Scenario Name</label><input value={current.name} onChange={e=>rename(e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="col"><label>Name</label><input value={current.form.name} onChange={e=>updateForm('name', e.target.value)} /></div>
        <div className="col"><label>Email</label><input value={current.form.email} onChange={e=>updateForm('email', e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="col"><label>Subject</label><input value={current.form.subject} onChange={e=>updateForm('subject', e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="col"><label>Message</label><textarea value={current.form.message} onChange={e=>updateForm('message', e.target.value)} /></div>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button onClick={run} className={loading? 'loading': ''} disabled={loading}>Preview</button>
        {current.preview && <button onClick={sendNow}>Send This Preview</button>}
        {current.preview && current.preview.matchedSection && <span className="badge">Test with Rule: {current.preview.matchedSection}</span>}
        {current.preview && <button className="secondary" onClick={()=>setDebugOpen(o=>!o)}>{debugOpen ? 'Hide Prompt' : 'Show Prompt'}</button>}
      </div>
      {current.preview && (
        <div className="card" style={{marginTop:12}}>
          <div className="small">Preview (not exact):</div>
          <div><strong>Subject:</strong> {current.preview.subject}</div>
          <div style={{marginTop:8}} dangerouslySetInnerHTML={{ __html: current.preview.html }} />
          {debugOpen && current.preview.debug && (
            <details open style={{marginTop:12}}>
              <summary>Raw Prompt</summary>
              <div className="small"><strong>System</strong></div>
              <pre className="small" style={{whiteSpace:'pre-wrap'}}>{current.preview.debug.system}</pre>
              <div className="small"><strong>User</strong></div>
              <pre className="small" style={{whiteSpace:'pre-wrap'}}>{current.preview.debug.user}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Queue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [jobDetail, setJobDetail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ruleNames, setRuleNames] = useState([]);
  const [ruleOverride, setRuleOverride] = useState('');

  const loadRules = async () => {
    try {
      const s = await fetch('/api/settings').then(r=>r.json());
      const names = (s.sections||[]).map(x=>x.name).filter(Boolean);
      setRuleNames(names);
    } catch {}
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/queue/items');
      const j = await res.json();
      setItems(j.items || []);
      if (selectedId && !((j.items || []).some(it=>it.id===selectedId))) {
        setSelectedId(null); setJobDetail(null); setPreview(null);
      }
    } finally { setLoading(false); }
  };
  const run = async () => {
    const res = await fetch('/api/worker/run', { method:'POST' });
    const j = await res.json();
    setLastRun(j);
    refresh();
  };
  const loadDetail = async (id) => {
    setSelectedId(id);
    setPreview(null);
    const res = await fetch(`/api/queue/item?id=${encodeURIComponent(id)}`);
    const j = await res.json();
    setJobDetail(j.job || null);
  };
  const doPreview = async () => {
    if (!selectedId) return;
    const res = await fetch('/api/queue/preview', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: selectedId, ruleName: ruleOverride || undefined }) });
    const j = await res.json();
    setPreview(j);
  };
  const respond = async () => {
    if (!selectedId) return;
    const res = await fetch('/api/queue/respond', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: selectedId }) });
    const j = await res.json();
    if (j && j.ok) { await refresh(); setSelectedId(null); setJobDetail(null); setPreview(null); }
  };
  const dequeue = async () => {
    if (!selectedId) return;
    const res = await fetch('/api/queue/dequeue', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: selectedId }) });
    const j = await res.json();
    if (j && j.ok) { await refresh(); setSelectedId(null); setJobDetail(null); setPreview(null); }
  };

  useEffect(()=>{ refresh(); loadRules(); },[]);

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Queue</h2>
        <div className="btnbar">
          <button className={`secondary ${loading?'loading':''}`} onClick={refresh} disabled={loading}>Refresh</button>
          <button onClick={run}>Run Worker</button>
        </div>
      </div>
      <div className="row">
        <div className="col">
          <div className="small">Pending</div>
          <div style={{fontSize:18,fontWeight:700}}>{items.length}</div>
          <div style={{marginTop:8, maxHeight:260, overflowY:'auto', border:'1px solid #232a3b', borderRadius:8}}>
            {items.map((it)=> (
              <div key={it.id} onClick={()=>loadDetail(it.id)} style={{padding:10, cursor:'pointer', background:selectedId===it.id?'#1b2333':'transparent', borderBottom:'1px solid #232a3b'}}>
                <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                  <div style={{fontWeight:600}}>{it.subject || '(no subject)'}</div>
                  <div className="small">{it.receivedAt ? new Date(it.receivedAt).toLocaleTimeString() : ''}</div>
                </div>
                <div className="small">{it.name} • {it.email}</div>
              </div>
            ))}
            {items.length===0 && <div className="small" style={{padding:10}}>Queue is empty.</div>}
          </div>
          {lastRun && (
            <div className="small" style={{marginTop:8}}>Processed {lastRun.processed} {lastRun.skipped?`(skipped: ${lastRun.skipped})`:''}</div>
          )}
        </div>
        <div className="col">
          {!jobDetail && <div className="small">Select a queued message to view details and preview.</div>}
          {jobDetail && (
            <div>
              <div className="row">
                <div className="col">
                  <label>From</label>
                  <input value={jobDetail.form?.email || ''} readOnly />
                </div>
                <div className="col">
                  <label>Name</label>
                  <input value={jobDetail.form?.name || jobDetail.form?.fullName || ''} readOnly />
                </div>
              </div>
              <div className="row">
                <div className="col">
                  <label>Subject</label>
                  <input value={jobDetail.form?.subject || ''} readOnly />
                </div>
              </div>
              <div className="row">
                <div className="col">
                  <label>Message</label>
                  <textarea value={jobDetail.form?.message || ''} readOnly />
                </div>
              </div>

              <div className="row">
                <div className="col">
                  <label>Rule Override</label>
                  <select value={ruleOverride} onChange={(e)=>setRuleOverride(e.target.value)}>
                    <option value="">Auto (best match)</option>
                    {ruleNames.map(n=> <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="btnbar" style={{marginTop:8}}>
                <button className="secondary" onClick={doPreview}>Preview</button>
                <button onClick={respond}>Respond (Send)</button>
                <button className="danger" onClick={dequeue}>Dequeue (Cancel)</button>
              </div>
              {preview && (
                <div className="card" style={{marginTop:12}}>
                  <div className="small">Matched Rule: {preview.matchedRule || '—'}</div>
                  <div><strong>Subject:</strong> {preview.preview?.subject}</div>
                  <div style={{marginTop:8}} dangerouslySetInnerHTML={{ __html: preview.preview?.html || '' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('Profile');
  useEffect(() => {
    fetch('/api/me').then(r=>r.json()).then(j=>{
      if (!j.authed) {
        window.location.href = '/admin/login';
      }
    }).catch(()=>{
      window.location.href = '/admin/login';
    });
  }, []);

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  };

  return (
    <div className="container">
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <h1>AI Replies Settings</h1>
        <button className="secondary" onClick={logout}>Logout</button>
      </div>
      <Tabs tab={tab} setTab={setTab} />
      {tab === 'Profile' && <Profile />}
      {tab === 'Tester' && <Tester />}
      {tab === 'Queue' && <Queue />}
      {tab === 'Rules' && <Sections />}
      {tab === 'Outbox' && <Outbox />}
      {tab === 'Logs' && <Logs />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
