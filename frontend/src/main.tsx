import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
  FolderCog,
  Home,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type View = "dashboard" | "agent" | "knowledge" | "logs" | "settings";
type AuditLog = { id: string; timestamp: string; event: string; payload: Record<string, unknown> };
type KBFile = { id: string; filename: string; size: number };
type SearchResult = { filename: string; chunk: string; score: number };
type CopilotEvent = { timestamp: string; type: string; message: string; data: Record<string, unknown> };
type CopilotRun = {
  id: string;
  prompt: string;
  status: string;
  final_answer: string;
  error: string;
  created_at: string;
  updated_at: string;
  event_count: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function App() {
  const [view, setView] = useState<View>("dashboard");
  const nav = [
    ["dashboard", Home, "总览"],
    ["agent", Sparkles, "AI 任务"],
    ["knowledge", Database, "知识库"],
    ["logs", Activity, "审计"],
    ["settings", Settings, "配置"],
  ] as const;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Bot size={23} strokeWidth={2.4} />
          </div>
          <div>
            <strong>DeepSeek Copilot</strong>
            <span>Workbench</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {nav.map(([id, Icon, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              <Icon size={20} strokeWidth={2.3} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button className="security-card" onClick={() => setView("logs")}>
          <ShieldCheck size={20} />
          <span>
            <strong>数据安全</strong>
            <small>命令执行受权限策略和审计日志保护</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </aside>

      <main className="workspace">
        <Topbar />
        {view === "dashboard" && <Dashboard setView={setView} />}
        {view === "agent" && <AgentV3 />}
        {view === "knowledge" && <Knowledge />}
        {view === "logs" && <Logs />}
        {view === "settings" && <SettingsView />}
      </main>
    </div>
  );
}

function Topbar() {
  return (
    <div className="topbar">
      <div className="search-pill">
        <Search size={18} />
        <span>搜索 (Ctrl+K)</span>
      </div>
      <button className="icon-button" aria-label="通知">
        <Bell size={19} />
      </button>
      <div className="avatar">U</div>
    </div>
  );
}

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

function Dashboard({ setView }: { setView: (view: View) => void }) {
  const metrics = [
    { icon: ShieldCheck, label: "权限模式", title: "READ ONLY", body: "只读模式，保障安全" },
    { icon: Database, label: "知识库", title: "本地索引", body: "管理本地资料与索引" },
    { icon: Activity, label: "审计", title: "JSONL", body: "导出审计数据" },
  ] as const;

  const cards = [
    {
      icon: Sparkles,
      title: "AI 任务",
      body: "把自然语言需求转成可执行任务，实时查看状态和输出结果。",
      action: "去创建任务",
      target: "agent" as View,
      tone: "green",
    },
    {
      icon: BookOpen,
      title: "知识库",
      body: "上传项目资料并建立索引，用检索结果辅助问答和分析。",
      action: "管理知识库",
      target: "knowledge" as View,
      tone: "blue",
    },
    {
      icon: FileText,
      title: "审计记录",
      body: "集中查看模型测试、命令执行、文件处理和检索事件。",
      action: "查看审计记录",
      target: "logs" as View,
      tone: "purple",
    },
  ];

  return (
    <section>
      <PageHeader eyebrow="👋 你好，欢迎回来！" title={<>DeepSeek Copilot <em>工作台</em></>}>
        面向本地项目的 AI 协作界面，保留命令能力，但让日常操作更清晰高效。
      </PageHeader>

      <div className="metric-grid">
        {metrics.map(({ icon: Icon, label, title, body }) => (
          <button className="metric-card" key={title}>
            <span className="soft-icon">
              <Icon size={30} />
            </span>
            <span className="pill">{label}</span>
            <strong>{title}</strong>
            <small>{body}</small>
            <ChevronRight className="card-arrow" size={18} />
          </button>
        ))}
      </div>

      <div className="feature-grid">
        {cards.map(({ icon: Icon, title, body, action, target, tone }) => (
          <article className="feature-card" key={title}>
            <span className={`soft-icon ${tone}`}>
              <Icon size={27} />
            </span>
            <h2>{title}</h2>
            <p>{body}</p>
            <button className={`outline-action ${tone}`} onClick={() => setView(target)}>
              {action}
              <ChevronRight size={17} />
            </button>
          </article>
        ))}
      </div>

      <RecentActivity setView={setView} />
    </section>
  );
}

function RecentActivity({ setView }: { setView: (view: View) => void }) {
  const rows = [
    ["分析项目结构并生成摘要", "AI 任务", "已完成", "今天 10:18", Sparkles, "agent"],
    ["上传并索引项目文档", "知识库", "已完成", "今天 09:45", BookOpen, "knowledge"],
    ["导出审计日志", "审计", "已完成", "昨天 16:21", Activity, "logs"],
    ["执行命令: ls -la", "命令执行", "已完成", "昨天 15:02", Zap, "agent"],
  ] as const;

  return (
    <section className="activity-panel">
      <div className="panel-heading">
        <div>
          <Activity size={21} />
          <strong>最近活动</strong>
        </div>
        <button onClick={() => setView("logs")}>
          查看全部
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="activity-list">
        {rows.map(([title, tag, status, time, Icon, target]) => (
          <button className="activity-row" key={`${title}-${time}`} onClick={() => setView(target)}>
            <span className="activity-icon">
              <Icon size={18} />
            </span>
            <strong>{title}</strong>
            <span className="tag">{tag}</span>
            <span className="status-badge">{status}</span>
            <time>{time}</time>
          </button>
        ))}
      </div>
    </section>
  );
}

function Agent() {
  const [prompt, setPrompt] = useState("分析 workspace 目录结构，生成项目摘要并列出潜在风险。");
  const [runId, setRunId] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const handledPermissionRequests = useRef<Set<string>>(new Set());

  async function run() {
    setError("");
    handledPermissionRequests.current.clear();
    setStatus("starting");
    try {
      const result = await api<{ id: string; status: string }>("/api/copilot/runs", {
        method: "POST",
        body: JSON.stringify({ prompt, max_steps: 8 }),
      });
      setRunId(result.id);
      setStatus(result.status);
    } catch (exc) {
      setStatus("failed");
      setError(exc instanceof Error ? exc.message : "任务启动失败");
    }
  }

  useEffect(() => {
    if (!runId) return;
    const timer = window.setInterval(async () => {
      const [runResult, eventResult] = await Promise.all([
        api<{ status: string; final_answer: string; error: string }>(`/api/copilot/runs/${runId}`),
        api<{ events: CopilotEvent[] }>(`/api/copilot/runs/${runId}/events`),
      ]);
      setStatus(runResult.status);
      for (const event of eventResult.events) {
        if (event.type !== "permission_request") continue;
        const requestId = String(event.data.request_id || "");
        if (!requestId || handledPermissionRequests.current.has(requestId)) continue;
        handledPermissionRequests.current.add(requestId);
        const approved = window.confirm(
          `Copilot requests permission.\n\nReason: ${event.message}\nTool: ${event.data.tool}\nArguments: ${JSON.stringify(event.data.arguments)}`,
        );
        await api(`/api/copilot/runs/${runId}/permissions`, {
          method: "POST",
          body: JSON.stringify({ request_id: requestId, approved }),
        });
      }
      setLogs(
        eventResult.events.map((event) => {
          const time = new Date(event.timestamp).toLocaleTimeString();
          const suffix = Object.keys(event.data).length > 0 ? ` ${JSON.stringify(event.data)}` : "";
          return `[${time}] ${event.type}: ${event.message}${suffix}`;
        }),
      );
    }, 1200);
    return () => window.clearInterval(timer);
  }, [runId]);

  return (
    <section>
      <PageHeader eyebrow="AI 任务" title="任务编排">
        用自然语言描述目标，配合受控命令执行，输出全过程会写入审计记录。
      </PageHeader>
      <div className="two-column">
        <div className="panel">
          <SectionTitle icon={<Sparkles size={19} />} title="创建任务" />
          <label>
            任务说明
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <button className="primary" onClick={run}>
            <Play size={18} />
            运行任务
          </button>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="panel">
          <div className="run-status">
            <span className={`status-dot ${status}`} />
            <div>
              <strong>{status.toUpperCase()}</strong>
              <span>{runId ? `Run ${runId.slice(0, 8)}` : "等待任务运行"}</span>
            </div>
          </div>
          <div className="timeline">
            {["创建运行记录", "校验权限策略", "执行受控命令", "写入审计日志"].map((item, index) => (
              <div className="timeline-row" key={item}>
                <CheckCircle2 size={18} />
                <span>{item}</span>
                <small>{index < 2 || runId ? "ready" : "pending"}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel output-panel">
        <SectionTitle icon={<FileText size={19} />} title="任务输出" />
        {logs.length === 0 ? (
          <div className="empty-state">运行任务后，这里会显示命令输出和执行日志。</div>
        ) : (
          <div className="log-list">
            {logs.map((line, index) => (
              <div className="log-line" key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AgentV3() {
  const [prompt, setPrompt] = useState("Analyze the workspace, summarize the project, and identify risks.");
  const [runId, setRunId] = useState("");
  const [runs, setRuns] = useState<CopilotRun[]>([]);
  const [events, setEvents] = useState<CopilotEvent[]>([]);
  const [status, setStatus] = useState("idle");
  const [finalAnswer, setFinalAnswer] = useState("");
  const [error, setError] = useState("");
  const handledPermissionRequests = useRef<Set<string>>(new Set());

  async function refreshRuns() {
    const result = await api<{ runs: CopilotRun[] }>("/api/copilot/runs");
    setRuns(result.runs);
  }

  function formatEvent(event: CopilotEvent) {
    const suffix = Object.keys(event.data).length > 0 ? ` ${JSON.stringify(event.data)}` : "";
    return `[${new Date(event.timestamp).toLocaleTimeString()}] ${event.type}: ${event.message}${suffix}`;
  }

  async function loadRun(id: string) {
    const [runResult, eventResult] = await Promise.all([
      api<CopilotRun>(`/api/copilot/runs/${id}`),
      api<{ events: CopilotEvent[] }>(`/api/copilot/runs/${id}/events`),
    ]);
    setRunId(id);
    setStatus(runResult.status);
    setFinalAnswer(runResult.final_answer || "");
    setError(runResult.error || "");
    setEvents(eventResult.events);
  }

  async function startRun() {
    setError("");
    setFinalAnswer("");
    setEvents([]);
    handledPermissionRequests.current.clear();
    setStatus("starting");
    try {
      const result = await api<CopilotRun>("/api/copilot/runs", {
        method: "POST",
        body: JSON.stringify({ prompt, max_steps: 8 }),
      });
      setRunId(result.id);
      setStatus(result.status);
      await refreshRuns();
    } catch (exc) {
      setStatus("failed");
      setError(exc instanceof Error ? exc.message : "Failed to start run");
    }
  }

  async function stopRun() {
    if (!runId) return;
    const result = await api<CopilotRun>(`/api/copilot/runs/${runId}/stop`, { method: "POST" });
    setStatus(result.status);
    await refreshRuns();
  }

  async function deleteRun(id: string) {
    await api(`/api/copilot/runs/${id}`, { method: "DELETE" });
    if (runId === id) {
      setRunId("");
      setEvents([]);
      setFinalAnswer("");
      setError("");
      setStatus("idle");
    }
    await refreshRuns();
  }

  useEffect(() => { void refreshRuns(); }, []);

  useEffect(() => {
    if (!runId) return;
    const timer = window.setInterval(async () => {
      const [runResult, eventResult] = await Promise.all([
        api<CopilotRun>(`/api/copilot/runs/${runId}`),
        api<{ events: CopilotEvent[] }>(`/api/copilot/runs/${runId}/events`),
      ]);
      setStatus(runResult.status);
      setFinalAnswer(runResult.final_answer || "");
      setError(runResult.error || "");
      setEvents(eventResult.events);

      for (const event of eventResult.events) {
        if (event.type !== "permission_request") continue;
        const requestId = String(event.data.request_id || "");
        if (!requestId || handledPermissionRequests.current.has(requestId)) continue;
        handledPermissionRequests.current.add(requestId);
        const approved = window.confirm(
          `Copilot requests permission.\n\nReason: ${event.message}\nTool: ${event.data.tool}\nArguments: ${JSON.stringify(event.data.arguments)}`,
        );
        await api(`/api/copilot/runs/${runId}/permissions`, {
          method: "POST",
          body: JSON.stringify({ request_id: requestId, approved }),
        });
      }

      if (["completed", "failed", "stopped"].includes(runResult.status)) {
        await refreshRuns();
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [runId]);

  return (
    <section>
      <PageHeader eyebrow="AI Agent" title="Copilot run console">
        Create persisted agent runs, review every event, approve risky tools, and revisit previous runs after restart.
      </PageHeader>
      <div className="two-column">
        <div className="panel">
          <SectionTitle icon={<Sparkles size={19} />} title="Create run" />
          <label>
            Task prompt
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <div className="button-row">
            <button className="primary" onClick={startRun}>
              <Play size={18} />
              Run task
            </button>
            <button className="secondary-action" disabled={!runId} onClick={stopRun}>
              Stop
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
          {finalAnswer && <div className="success-box">{finalAnswer}</div>}
        </div>
        <div className="panel">
          <div className="run-status">
            <span className={`status-dot ${status}`} />
            <div>
              <strong>{status.toUpperCase()}</strong>
              <span>{runId ? `Run ${runId.slice(0, 8)}` : "No active run"}</span>
            </div>
          </div>
          <SectionTitle icon={<Activity size={19} />} title="Run history" />
          <div className="run-list">
            {runs.length === 0 && <div className="empty-state">No runs yet.</div>}
            {runs.map((run) => (
              <div className={run.id === runId ? "run-row active" : "run-row"} key={run.id}>
                <button onClick={() => loadRun(run.id)}>
                  <strong>{run.prompt}</strong>
                  <span>{run.status} - {run.event_count} events - {new Date(run.updated_at).toLocaleString()}</span>
                </button>
                <button title="Delete run" onClick={() => deleteRun(run.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel output-panel">
        <SectionTitle icon={<FileText size={19} />} title="Event stream" />
        {events.length === 0 ? (
          <div className="empty-state">Run events will appear here.</div>
        ) : (
          <div className="log-list">
            {events.map((event) => (
              <div className="log-line" key={`${event.timestamp}-${event.type}-${event.message}`}>
                {formatEvent(event)}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Knowledge() {
  const [files, setFiles] = useState<KBFile[]>([]);
  const [query, setQuery] = useState("项目架构说明");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const result = await api<{ files: KBFile[] }>("/api/kb/files");
    setFiles(result.files);
  }

  useEffect(() => { void refresh(); }, []);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await api("/api/kb/upload", { method: "POST", body: form });
    setMessage("文件已上传");
    await refresh();
  }

  async function ingest(fileId?: string) {
    await api("/api/kb/ingest", { method: "POST", body: JSON.stringify({ file_id: fileId }) });
    setMessage("索引已更新");
  }

  async function search() {
    const result = await api<{ results: SearchResult[] }>("/api/kb/query", {
      method: "POST",
      body: JSON.stringify({ query, top_k: 5 }),
    });
    setResults(result.results);
  }

  async function remove(fileId: string) {
    await api(`/api/kb/files/${fileId}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <section>
      <PageHeader eyebrow="知识库" title="本地资料索引">
        上传项目资料，建立本地向量索引，用检索结果辅助分析和问答。
      </PageHeader>
      <div className="two-column">
        <div className="panel">
          <SectionTitle icon={<Upload size={19} />} title="资料管理" />
          <label className="upload-control">
            <Upload size={22} />
            <span>上传 PDF、DOCX、TXT 或 Markdown 文件</span>
            <input type="file" onChange={upload} />
          </label>
          <button onClick={() => ingest()}>
            <Database size={18} />
            重建全部索引
          </button>
          {message && <div className="success-box">{message}</div>}
          <div className="file-list">
            {files.length === 0 && <div className="empty-state">还没有上传资料。</div>}
            {files.map((file) => (
              <div className="file-row" key={file.id}>
                <FolderCog size={18} />
                <span>{file.filename}</span>
                <button title="建立索引" onClick={() => ingest(file.id)}><Database size={16} /></button>
                <button title="删除" onClick={() => remove(file.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <SectionTitle icon={<Search size={19} />} title="检索测试" />
          <div className="search-form">
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
            <button className="primary" onClick={search}>
              <Search size={18} />
              检索
            </button>
          </div>
          <div className="results">
            {results.length === 0 && <div className="empty-state">输入问题后，检索结果会显示在这里。</div>}
            {results.map((result) => (
              <article className="result-card" key={`${result.filename}-${result.score}`}>
                <strong>{result.filename}</strong>
                <span>相关度 {result.score.toFixed(3)}</span>
                <p>{result.chunk}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Logs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  useEffect(() => { void api<{ logs: AuditLog[] }>("/api/logs").then((result) => setLogs(result.logs)); }, []);
  return (
    <section>
      <PageHeader eyebrow="审计" title="审计记录">
        查看模型测试、命令执行、文件处理和检索事件。
      </PageHeader>
      <div className="panel audit-list">
        {logs.length === 0 && <div className="empty-state">暂无审计记录。</div>}
        {logs.map((log) => (
          <div className="audit-row" key={log.id}>
            <span>{new Date(log.timestamp).toLocaleString()}</span>
            <strong>{log.event}</strong>
            <code>{JSON.stringify(log.payload)}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsView() {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  useEffect(() => { void api<Record<string, unknown>>("/api/models/config").then(setConfig); }, []);
  const rows = useMemo(() => Object.entries(config), [config]);
  return (
    <section>
      <PageHeader eyebrow="配置" title="运行配置">
        当前后端模型、路径和权限配置。
      </PageHeader>
      <div className="settings-grid">
        {rows.length === 0 && <div className="panel empty-state">未读取到配置。</div>}
        {rows.map(([key, value]) => (
          <div className="setting-card" key={key}>
            <span>{key}</span>
            <strong>{String(value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="section-title">
      {icon}
      <strong>{title}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
