const { useState, useEffect } = React;

function Tabs({ tab, setTab }) {
  const tabs = ['Profile', 'Tester', 'Queue', 'Sections', 'Logs'];
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

  useEffect(() => {
    fetch('/api/settings').then(r=>r.json()).then((s)=>{
      // Initialize keywordsText for UX
      const secs = Array.isArray(s.sections) ? s.sections.map(sec => ({
        ...sec,
        keywordsText: Array.isArray(sec.keywords) ? sec.keywords.join(', ') : (sec.keywordsText || ''),
      })) : [];
      setSettings({ ...s, sections: secs });
    });
  }, []);

  if (!settings) return <div className="card">Loading…</div>;

  const sections = Array.isArray(settings.sections) ? settings.sections : [];

  const updateSection = (idx, patch) => {
    const next = sections.map((s,i)=> i===idx ? { ...s, ...patch } : s);
    setSettings(s=>({ ...s, sections: next }));
  };
  const removeSection = (idx) => {
    const next = sections.filter((_,i)=>i!==idx);
    setSettings(s=>({ ...s, sections: next }));
  };
  const addSection = () => {
    const next = sections.concat([{ name:'', keywords:[], priority:0, instructions:'', enabled: true }]);
    setSettings(s=>({ ...s, sections: next }));
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
  };

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Sections</h2>
        <div style={{display:'flex', gap:8}}>
          <button className="secondary" onClick={addSection}>Add Section</button>
          <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {sections.length === 0 && (<div className="small">No sections yet. Click "Add Section" to create your first rule.</div>)}

      {sections.map((sec, idx) => (
        <div key={idx} className="card" style={{marginTop:12}}>
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
              <textarea value={sec.instructions||''} onChange={e=>updateSection(idx,{ instructions: e.target.value })} placeholder="What should AI do when this section matches?" />
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button className="danger" onClick={()=>removeSection(idx)}>Delete</button>
          </div>
        </div>
      ))}
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
  );
}

function Profile() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState(''); // 'enable' | 'disable' | ''
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

      <div style={{display:'flex', gap:8, marginTop:12}}>
        <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
      </div>
    </div>
  );
}

function Tester() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [preview, setPreview] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const update = (k,v)=> setForm(s=>({ ...s, [k]: v }));
  const run = async () => {
    const res = await fetch('/api/tester', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    const json = await res.json();
    setPreview(json);
  };
  const sendNow = async () => {
    // Submit to real intake so it goes into the queue, then trigger worker
    await fetch('/intake', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    await fetch('/api/worker/run', { method:'POST' });
    alert('Sent: queued and worker triggered. Check your inbox and Logs.');
  };
  return (
    <div className="card">
      <h2>Tester</h2>
      <div className="row">
        <div className="col"><label>Name</label><input value={form.name} onChange={e=>update('name', e.target.value)} /></div>
        <div className="col"><label>Email</label><input value={form.email} onChange={e=>update('email', e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="col"><label>Subject</label><input value={form.subject} onChange={e=>update('subject', e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="col"><label>Message</label><textarea value={form.message} onChange={e=>update('message', e.target.value)} /></div>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button onClick={run}>Preview</button>
        {preview && <button onClick={sendNow}>Send This Preview</button>}
        {preview && preview.matchedSection && <span className="badge">Test with Section: {preview.matchedSection}</span>}
        {preview && <button className="secondary" onClick={()=>setDebugOpen(o=>!o)}>{debugOpen ? 'Hide Prompt' : 'Show Prompt'}</button>}
      </div>
      {preview && (
        <div className="card" style={{marginTop:12}}>
          <div className="small">Preview (not exact):</div>
          <div><strong>Subject:</strong> {preview.subject}</div>
          <div style={{marginTop:8}} dangerouslySetInnerHTML={{ __html: preview.html }} />
          {debugOpen && preview.debug && (
            <details open style={{marginTop:12}}>
              <summary>Raw Prompt</summary>
              <div className="small"><strong>System</strong></div>
              <pre className="small" style={{whiteSpace:'pre-wrap'}}>{preview.debug.system}</pre>
              <div className="small"><strong>User</strong></div>
              <pre className="small" style={{whiteSpace:'pre-wrap'}}>{preview.debug.user}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Queue() {
  const [length, setLength] = useState(0);
  const [lastRun, setLastRun] = useState(null);
  const refresh = async () => {
    const res = await fetch('/api/queue');
    const j = await res.json();
    setLength(j.length||0);
  };
  const run = async () => {
    const res = await fetch('/api/worker/run', { method:'POST' });
    const j = await res.json();
    setLastRun(j);
    refresh();
  };
  useEffect(()=>{ refresh(); },[]);
  return (
    <div className="card">
      <h2>Queue</h2>
      <div>Pending: {length}</div>
      <div style={{display:'flex', gap:8, marginTop:8}}>
        <button className="secondary" onClick={refresh}>Refresh</button>
        <button onClick={run}>Run Worker</button>
      </div>
      {lastRun && (
        <div className="small" style={{marginTop:8}}>Processed {lastRun.processed} — Remaining {lastRun.remaining}</div>
      )}
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
      {tab === 'Sections' && <Sections />}
      {tab === 'Logs' && <Logs />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
