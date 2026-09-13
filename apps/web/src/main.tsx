import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

interface ResolveData {
  channel: string;
  vodId: string;
  title: string;
  durationSeconds: number;
}

function App() {
  const [input, setInput] = useState("https://www.twitch.tv/videos/123456");
  const [resolved, setResolved] = useState<ResolveData | null>(null);
  const [job, setJob] = useState<{ jobId: string; stage: string; progress: number | null; error?: string | null } | null>(null);
  const [message, setMessage] = useState("Ready");

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
    setMessage("Resolving VOD");
    const response = await fetch(`${apiBase}/api/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input })
    });
    const body = await response.json();
    if (body.status !== "ok") throw new Error(body.message);
    setResolved(body.data);
    setMessage("VOD resolved");
  }

  async function startJob() {
    const vodId = resolved?.vodId ?? input.match(/videos\/(\d+)/)?.[1] ?? "local";
    const response = await fetch(`${apiBase}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vodId, input })
    });
    const body = await response.json();
    if (body.status !== "ok") throw new Error(body.message);
    setJob(body.data);
    setMessage("Job queued");
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
          <input value={input} onChange={(event) => setInput(event.target.value)} />
          <button onClick={resolveVod}>Resolve</button>
          <button onClick={startJob}>Start Job</button>
        </div>

        <div className="grid">
          <Panel title="Resolved VOD">
            {resolved ? (
              <dl>
                <dt>Channel</dt><dd>{resolved.channel}</dd>
                <dt>VOD</dt><dd>{resolved.vodId}</dd>
                <dt>Title</dt><dd>{resolved.title}</dd>
                <dt>Duration</dt><dd>{Math.round(resolved.durationSeconds / 60)} min</dd>
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
            <pre>{`npm run local:pipeline -- ${input}`}</pre>
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
