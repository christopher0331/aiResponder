const { useState, useEffect } = React;

function Tabs({ tab, setTab }) {
  const tabs = ['Profile', 'Tester', 'Queue'];
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

function Profile() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch('/api/settings').then(r=>r.json()).then(setSettings);
  }, []);
  if (!settings) return <div className="card">Loading…</div>;
  const update = (k,v)=> setSettings(s=>({ ...s, [k]: v }));
  const save = async () => {
    setSaving(true);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const json = await res.json();
    setSettings(json); setSaving(false);
  };
  return (
    <div className="card">
      <h2>AI Replies Settings</h2>
      <div className="row">
        <div className="col">
          <label>Enable Auto-Responder</label>
          <input type="checkbox" checked={!!settings.enableAutoResponder} onChange={e=>update('enableAutoResponder', e.target.checked)} />
        </div>
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
  const update = (k,v)=> setForm(s=>({ ...s, [k]: v }));
  const run = async () => {
    const res = await fetch('/api/tester', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    const json = await res.json();
    setPreview(json);
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
      <button onClick={run}>Preview</button>
      {preview && (
        <div className="card" style={{marginTop:12}}>
          <div className="small">Preview (not exact):</div>
          <div><strong>Subject:</strong> {preview.subject}</div>
          <div style={{marginTop:8}} dangerouslySetInnerHTML={{ __html: preview.html }} />
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
  return (
    <div className="container">
      <h1>AI Replies Settings</h1>
      <Tabs tab={tab} setTab={setTab} />
      {tab === 'Profile' && <Profile />}
      {tab === 'Tester' && <Tester />}
      {tab === 'Queue' && <Queue />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
