import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

interface ResolveData {
  channel: string;
  vodId: string;
  title: string;
  durationSeconds: number;
  createdAt?: string;
  url?: string;
}

function App() {
  const [input, setInput] = useState("https://www.twitch.tv/videos/123456");
  const [resolved, setResolved] = useState<ResolveData | null>(null);
  const [vods, setVods] = useState<ResolveData[]>([]);
  const [selectedVod, setSelectedVod] = useState<ResolveData | null>(null);
  const [job, setJob] = useState<{ jobId: string; stage: string; progress: number | null; error?: string | null } | null>(null);
  const [message, setMessage] = useState("Ready");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!job || job.stage === "COMPLETE" || job.stage === "FAILED") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`${apiBase}/api/jobs/${job.jobId}`);
      if (!response.ok) return;
      const body = await response.json();
      if (body.status === "ok") setJob(body.data);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.stage]);

  async function resolveVod() {
    setBusy(true); setMessage("Resolving VOD");
    try {
    if (!input.trim().match(/^\d+$/) && !input.includes("/videos/")) {
      const response = await fetch(`${apiBase}/api/vods?channel=${encodeURIComponent(input)}&limit=20`);
      const body = await response.json();
      if (body.status !== "ok") throw new Error(body.message);
      setVods(body.data);
      setResolved(null);
      setSelectedVod(null);
      setMessage("Select VOD");
      return;
    }
    const response = await fetch(`${apiBase}/api/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input })
    });
    const body = await response.json();
    if (body.status !== "ok") throw new Error(body.message);
    setResolved(body.data);
    setSelectedVod(body.data);
    setVods([]);
    setMessage("VOD resolved");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to resolve VOD"); }
    finally { setBusy(false); }
  }

  async function startJob() {
    setBusy(true);
    try {
    const chosen = selectedVod ?? (input.match(/^\d+$/) ? null : undefined);
    if (input.trim().match(/^\d+$/) && !selectedVod) {
      const response = await fetch(`${apiBase}/api/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) });
      const body = await response.json();
      if (body.status !== "ok") throw new Error(body.message);
      setResolved(body.data);
      setSelectedVod(body.data);
      return;
    }
    if (input.includes("twitch.tv") && !chosen) {
      setMessage("Select a VOD first");
      return;
    }
    const vodId = chosen?.vodId ?? "local";
    const response = await fetch(`${apiBase}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vodId })
    });
    const body = await response.json();
    if (body.status !== "ok") throw new Error(body.message);
    setJob(body.data);
    setMessage("Job queued");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start job"); }
    finally { setBusy(false); }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <h1>Mortal Shell II Auto-Clipper</h1>
          <p>Control plane for latest VOD jobs. Heavy video work runs on local PC.</p>
        </div>
        <code>{message}</code>
      </section>

      <section className="workspace">
        <div className="inputRow">
          <label className="srOnly" htmlFor="vod-input">Twitch channel, VOD URL, VOD ID, or local file</label>
          <input id="vod-input" value={input} onChange={(event) => setInput(event.target.value)} aria-describedby="input-help" />
          <button onClick={resolveVod} disabled={busy}>Resolve</button>
          <button onClick={startJob} disabled={busy || !selectedVod && input.includes("twitch.tv")}>Start Job</button>
        </div>
        <p id="input-help" className="help">Select historical VOD to lock exact VOD ID before processing.</p>

        <div className="grid">
          {vods.length ? <Panel title="Recent VODs">
            <div className="vodList">
              {vods.map((vod) => <button className="vodItem" key={vod.vodId} onClick={() => { setSelectedVod(vod); setResolved(vod); setMessage("VOD selected"); }}>
                <span>{vod.title}</span><small>{Math.round(vod.durationSeconds / 60)} min</small><strong>Process</strong>
              </button>)}
            </div>
          </Panel> : null}
          <Panel title="Resolved VOD">
            {selectedVod ? (
              <dl>
                <dt>Channel</dt><dd>{selectedVod.channel}</dd>
                <dt>VOD</dt><dd>{selectedVod.vodId}</dd>
                <dt>Title</dt><dd>{selectedVod.title}</dd>
                <dt>Duration</dt><dd>{Math.round(selectedVod.durationSeconds / 60)} min</dd>
              </dl>
            ) : <p>No VOD resolved yet.</p>}
          </Panel>

          <Panel title="Job">
            {job ? (
              <dl>
                <dt>ID</dt><dd>{job.jobId}</dd>
                <dt>Stage</dt><dd>{job.stage}</dd>
                <dt>Progress</dt><dd>{job.progress === null ? "Running" : `${Math.round(job.progress * 100)}%`}</dd>
                {job.error ? <><dt>Error</dt><dd>{job.error}</dd></> : null}
              </dl>
            ) : <p>No job created yet.</p>}
          </Panel>

          <Panel title="Local Processing">
            <pre>{`npm run local:pipeline -- ${selectedVod ? `https://www.twitch.tv/videos/${selectedVod.vodId}` : input}`}</pre>
            <p>Use this command on local PC to acquire, analyze, score, and render clips.</p>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
