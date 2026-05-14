import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  ChevronRight,
  CircleStop,
  Clock3,
  Command,
  Database,
  FileText,
  FolderCog,
  Home,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type View = "dashboard" | "agent" | "knowledge" | "logs" | "settings";
type AuditLog = { id: string; timestamp: string; event: string; payload: Record<string, unknown> };
type KBFile = { id: string; filename: string; size: number };
type SearchResult = { filename: string; chunk: string; score: number };
type CopilotEvent = { timestamp: string; type: string; message: string; data: Record<string, unknown> };
type ModelConfig = { base_url: string; default_model: string; api_key_configured: boolean };
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

type Toast = { type: "success" | "error" | "info"; text: string };

const navItems = [
  { id: "dashboard", icon: Home, label: "总览", hint: "工作台" },
  { id: "agent", icon: Sparkles, label: "AI 任务", hint: "运行与审批" },
  { id: "knowledge", icon: Database, label: "知识库", hint: "资料索引" },
  { id: "logs", icon: Activity, label: "审计", hint: "事件追踪" },
  { id: "settings", icon: Settings, label: "配置", hint: "模型连接" },
] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function formatDate(value?: string) {
  if (!value) return "暂无";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function compactBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [snapshotTick, setSnapshotTick] = useState(0);

  const notify = useCallback((next: Toast) => {
    setToast(next);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("dashboard")}>
          <span className="brand-mark"><Bot size={24} strokeWidth={2.4} /></span>
          <span>
            <strong>DeepSeek Copilot</strong>
            <small>Local AI Workbench</small>
          </span>
        </button>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map(({ id, icon: Icon, label, hint }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              <Icon size={20} strokeWidth={2.25} />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </button>
          ))}
        </nav>

        <button className="security-card" onClick={() => setView("logs")}>
          <ShieldCheck size={21} />
          <span>
            <strong>受控执行</strong>
            <small>命令、文件和模型调用都会进入本地审计链路</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </aside>

      <main className="workspace">
        <Topbar
          view={view}
          onSearch={() => setSearchOpen(true)}
          onNotify={() => setNotificationsOpen((open) => !open)}
          onRefresh={() => setSnapshotTick((tick) => tick + 1)}
          notificationsOpen={notificationsOpen}
          setView={setView}
        />
        {view === "dashboard" && <Dashboard key={snapshotTick} setView={setView} notify={notify} />}
        {view === "agent" && <AgentConsole notify={notify} />}
        {view === "knowledge" && <Knowledge notify={notify} />}
        {view === "logs" && <Logs />}
        {view === "settings" && <SettingsView notify={notify} />}
      </main>

      {searchOpen && <CommandPalette setView={setView} onClose={() => setSearchOpen(false)} />}
      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
    </div>
  );
}

function Topbar({
  view,
  onSearch,
  onNotify,
  onRefresh,
  notificationsOpen,
  setView,
}: {
  view: View;
  onSearch: () => void;
  onNotify: () => void;
  onRefresh: () => void;
  notificationsOpen: boolean;
  setView: (view: View) => void;
}) {
  return (
    <div className="topbar">
      <div>
        <span className="crumb">工作台 / {navItems.find((item) => item.id === view)?.label}</span>
        <strong>{view === "dashboard" ? "今日运行态势" : navItems.find((item) => item.id === view)?.hint}</strong>
      </div>
      <div className="topbar-actions">
        <button className="search-pill" onClick={onSearch}>
          <Search size={17} />
          <span>搜索页面、动作和记录</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="icon-button" aria-label="刷新状态" title="刷新状态" onClick={onRefresh}>
          <RefreshCw size={18} />
        </button>
        <button className="icon-button has-dot" aria-label="通知" title="通知" onClick={onNotify}>
          <Bell size={18} />
        </button>
        <div className="avatar">DC</div>
      </div>
      {notificationsOpen && <NotificationPanel setView={setView} />}
    </div>
  );
}

function CommandPalette({ setView, onClose }: { setView: (view: View) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const actions = [
    { label: "创建 AI 任务", desc: "打开 Copilot 运行控制台", view: "agent" as View, icon: Sparkles },
    { label: "上传知识库文件", desc: "管理 PDF、DOCX、Markdown 和文本资料", view: "knowledge" as View, icon: Upload },
    { label: "检索知识库", desc: "测试本地向量索引效果", view: "knowledge" as View, icon: Search },
    { label: "查看审计日志", desc: "排查模型、权限和文件处理事件", view: "logs" as View, icon: Activity },
    { label: "配置模型 API", desc: "更新 base URL、模型名和密钥", view: "settings" as View, icon: KeyRound },
  ];
  const filtered = actions.filter((action) => `${action.label}${action.desc}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="command-panel">
        <div className="command-search">
          <Command size={19} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入任务、页面或动作" />
          <button aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="command-results">
          {filtered.map(({ label, desc, view, icon: Icon }) => (
            <button key={label} onClick={() => { setView(view); onClose(); }}>
              <Icon size={19} />
              <span><strong>{label}</strong><small>{desc}</small></span>
              <ChevronRight size={17} />
            </button>
          ))}
          {filtered.length === 0 && <div className="empty-state compact">没有匹配动作</div>}
        </div>
      </div>
    </div>
  );
}

function NotificationPanel({ setView }: { setView: (view: View) => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  useEffect(() => { void api<{ logs: AuditLog[] }>("/api/logs?limit=4").then((result) => setLogs(result.logs)).catch(() => setLogs([])); }, []);
  return (
    <div className="notification-panel">
      <div className="panel-heading tight">
        <strong>通知中心</strong>
        <button onClick={() => setView("logs")}>打开审计</button>
      </div>
      {logs.length === 0 && <div className="empty-state compact">暂无新事件</div>}
      {logs.map((log) => (
        <button className="notice-row" key={log.id} onClick={() => setView("logs")}>
          <Activity size={16} />
          <span><strong>{log.event}</strong><small>{formatDate(log.timestamp)}</small></span>
        </button>
      ))}
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

function Dashboard({ setView, notify }: { setView: (view: View) => void; notify: (toast: Toast) => void }) {
  const [runs, setRuns] = useState<CopilotRun[]>([]);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ runs: CopilotRun[] }>("/api/copilot/runs?limit=6"),
      api<{ files: KBFile[] }>("/api/kb/files"),
      api<{ logs: AuditLog[] }>("/api/logs?limit=6"),
      api<ModelConfig>("/api/models/config"),
    ])
      .then(([runResult, fileResult, logResult, modelResult]) => {
        setRuns(runResult.runs);
        setFiles(fileResult.files);
        setLogs(logResult.logs);
        setConfig(modelResult);
      })
      .catch((exc) => notify({ type: "error", text: exc instanceof Error ? exc.message : "总览数据加载失败" }))
      .finally(() => setLoading(false));
  }, [notify]);

  const running = runs.filter((run) => ["starting", "running"].includes(run.status)).length;
  const completed = runs.filter((run) => run.status === "completed").length;
  const indexedSize = files.reduce((total, file) => total + file.size, 0);

  const metrics = [
    { icon: Zap, label: "任务运行", value: `${running} 个进行中`, body: `${completed} 个历史任务已完成`, target: "agent" as View },
    { icon: Database, label: "知识库", value: `${files.length} 份资料`, body: `累计 ${compactBytes(indexedSize)}`, target: "knowledge" as View },
    { icon: ShieldCheck, label: "模型连接", value: config?.api_key_configured ? "已配置" : "待配置", body: config?.default_model || "未读取到模型", target: "settings" as View },
  ];

  return (
    <section>
      <PageHeader eyebrow="本地 AI 协作台" title={<>把任务、知识和审计放在同一个 <em>操作面</em></>}>
        面向项目开发的控制台：快速发起 Copilot 任务，管理本地资料索引，查看每一次模型调用和受控操作的痕迹。
      </PageHeader>

      <div className="hero-strip">
        <div>
          <span>系统状态</span>
          <strong>{loading ? "正在同步..." : running ? "有任务运行中" : "空闲，可发起新任务"}</strong>
        </div>
        <button className="primary" onClick={() => setView("agent")}>
          <Play size={18} />
          新建任务
        </button>
      </div>

      <div className="metric-grid">
        {metrics.map(({ icon: Icon, label, value, body, target }) => (
          <button className="metric-card" key={label} onClick={() => setView(target)}>
            <span className="soft-icon"><Icon size={28} /></span>
            <span className="pill">{label}</span>
            <strong>{value}</strong>
            <small>{body}</small>
            <ChevronRight className="card-arrow" size={18} />
          </button>
        ))}
      </div>

      <div className="feature-grid">
        <FeatureCard icon={Sparkles} title="任务编排" body="用自然语言描述目标，运行过程会持续写入事件流；权限请求会在界面内确认。" action="打开控制台" onClick={() => setView("agent")} />
        <FeatureCard icon={BookOpen} title="知识库检索" body="上传项目资料，重建索引后可直接用问题测试召回片段，适合补充上下文。" action="管理资料" onClick={() => setView("knowledge")} tone="blue" />
        <FeatureCard icon={FileText} title="审计追踪" body="集中查看模型测试、文件处理、知识库检索和 Copilot 运行事件。" action="查看日志" onClick={() => setView("logs")} tone="amber" />
      </div>

      <section className="activity-panel">
        <div className="panel-heading">
          <div><Activity size={21} /><strong>最近动态</strong></div>
          <button onClick={() => setView("logs")}>查看全部 <ChevronRight size={16} /></button>
        </div>
        <div className="activity-list">
          {logs.length === 0 && <div className="empty-state">暂无审计记录。完成一次模型测试、上传或检索后会显示在这里。</div>}
          {logs.map((log) => (
            <button className="activity-row" key={log.id} onClick={() => setView("logs")}>
              <span className="activity-icon"><Activity size={18} /></span>
              <strong>{log.event}</strong>
              <span className="tag">{Object.keys(log.payload)[0] || "event"}</span>
              <span className="status-badge">已记录</span>
              <time>{formatDate(log.timestamp)}</time>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  action,
  onClick,
  tone = "green",
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  tone?: "green" | "blue" | "amber";
}) {
  return (
    <article className="feature-card">
      <span className={`soft-icon ${tone}`}><Icon size={27} /></span>
      <h2>{title}</h2>
      <p>{body}</p>
      <button className={`outline-action ${tone}`} onClick={onClick}>
        {action}
        <ChevronRight size={17} />
      </button>
    </article>
  );
}

function AgentConsole({ notify }: { notify: (toast: Toast) => void }) {
  const [prompt, setPrompt] = useState("分析当前项目结构，指出前端空壳页面、交互缺口和优先改进建议。");
  const [runId, setRunId] = useState("");
  const [runs, setRuns] = useState<CopilotRun[]>([]);
  const [events, setEvents] = useState<CopilotEvent[]>([]);
  const [status, setStatus] = useState("idle");
  const [finalAnswer, setFinalAnswer] = useState("");
  const [error, setError] = useState("");
  const handledPermissionRequests = useRef<Set<string>>(new Set());

  const refreshRuns = useCallback(async () => {
    const result = await api<{ runs: CopilotRun[] }>("/api/copilot/runs");
    setRuns(result.runs);
  }, []);

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
      notify({ type: "success", text: "任务已启动" });
      await refreshRuns();
    } catch (exc) {
      setStatus("failed");
      const message = exc instanceof Error ? exc.message : "任务启动失败";
      setError(message);
      notify({ type: "error", text: message });
    }
  }

  async function stopRun() {
    if (!runId) return;
    const result = await api<CopilotRun>(`/api/copilot/runs/${runId}/stop`, { method: "POST" });
    setStatus(result.status);
    notify({ type: "info", text: "已请求停止任务" });
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
    notify({ type: "success", text: "运行记录已删除" });
    await refreshRuns();
  }

  useEffect(() => { void refreshRuns(); }, [refreshRuns]);

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
          `Copilot 请求权限\n\n原因：${event.message}\n工具：${event.data.tool}\n参数：${JSON.stringify(event.data.arguments)}`,
        );
        await api(`/api/copilot/runs/${runId}/permissions`, {
          method: "POST",
          body: JSON.stringify({ request_id: requestId, approved }),
        });
      }

      if (["completed", "failed", "stopped"].includes(runResult.status)) await refreshRuns();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [runId, refreshRuns]);

  return (
    <section>
      <PageHeader eyebrow="AI 任务" title="Copilot 运行控制台">
        创建可持久化的 Agent 任务，查看事件流，审批敏感工具调用，并回看历史运行结果。
      </PageHeader>
      <div className="two-column wide-left">
        <div className="panel">
          <SectionTitle icon={<Sparkles size={19} />} title="创建任务" />
          <label>
            任务说明
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <div className="button-row">
            <button className="primary" disabled={!prompt.trim() || ["running", "starting"].includes(status)} onClick={startRun}>
              {["running", "starting"].includes(status) ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
              运行任务
            </button>
            <button className="secondary-action" disabled={!runId || !["running", "starting"].includes(status)} onClick={stopRun}>
              <CircleStop size={18} />
              停止
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
          {finalAnswer && <div className="success-box result-answer">{finalAnswer}</div>}
        </div>
        <div className="panel">
          <StatusBlock status={status} runId={runId} />
          <SectionTitle icon={<Clock3 size={19} />} title="运行历史" />
          <div className="run-list">
            {runs.length === 0 && <div className="empty-state">还没有运行记录。</div>}
            {runs.map((run) => (
              <div className={run.id === runId ? "run-row active" : "run-row"} key={run.id}>
                <button onClick={() => loadRun(run.id)}>
                  <strong>{run.prompt}</strong>
                  <span>{run.status} · {run.event_count} events · {formatDate(run.updated_at)}</span>
                </button>
                <button title="删除运行记录" onClick={() => deleteRun(run.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel output-panel">
        <SectionTitle icon={<FileText size={19} />} title="事件流" />
        {events.length === 0 ? (
          <div className="empty-state">运行任务后，工具调用、权限请求和最终输出会显示在这里。</div>
        ) : (
          <div className="log-list">
            {events.map((event) => (
              <div className="log-line" key={`${event.timestamp}-${event.type}-${event.message}`}>
                <span>{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                <strong>{event.type}</strong>
                <p>{event.message}</p>
                {Object.keys(event.data).length > 0 && <code>{JSON.stringify(event.data)}</code>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatusBlock({ status, runId }: { status: string; runId: string }) {
  return (
    <div className="run-status">
      <span className={`status-dot ${status}`} />
      <div>
        <strong>{status.toUpperCase()}</strong>
        <span>{runId ? `Run ${runId.slice(0, 8)}` : "暂无活动任务"}</span>
      </div>
    </div>
  );
}

function Knowledge({ notify }: { notify: (toast: Toast) => void }) {
  const [files, setFiles] = useState<KBFile[]>([]);
  const [query, setQuery] = useState("项目架构说明");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await api<{ files: KBFile[] }>("/api/kb/files");
    setFiles(result.files);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    try {
      await api("/api/kb/upload", { method: "POST", body: form });
      notify({ type: "success", text: "文件已上传" });
      await refresh();
    } catch (exc) {
      notify({ type: "error", text: exc instanceof Error ? exc.message : "上传失败" });
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function ingest(fileId?: string) {
    setBusy(true);
    try {
      await api("/api/kb/ingest", { method: "POST", body: JSON.stringify({ file_id: fileId }) });
      notify({ type: "success", text: "索引已更新" });
    } catch (exc) {
      notify({ type: "error", text: exc instanceof Error ? exc.message : "索引更新失败" });
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    setBusy(true);
    try {
      const result = await api<{ results: SearchResult[] }>("/api/kb/query", {
        method: "POST",
        body: JSON.stringify({ query, top_k: 5 }),
      });
      setResults(result.results);
    } catch (exc) {
      notify({ type: "error", text: exc instanceof Error ? exc.message : "检索失败" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(fileId: string) {
    await api(`/api/kb/files/${fileId}`, { method: "DELETE" });
    notify({ type: "success", text: "文件已删除" });
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
            <Upload size={24} />
            <span>上传 PDF、DOCX、TXT 或 Markdown 文件</span>
            <small>文件会保存在本地知识库目录</small>
            <input type="file" onChange={upload} />
          </label>
          <button className="secondary-action full" disabled={busy || files.length === 0} onClick={() => ingest()}>
            <Database size={18} />
            重建全部索引
          </button>
          <div className="file-list">
            {files.length === 0 && <div className="empty-state">还没有上传资料。</div>}
            {files.map((file) => (
              <div className="file-row" key={file.id}>
                <FolderCog size={18} />
                <span><strong>{file.filename}</strong><small>{compactBytes(file.size)}</small></span>
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
            <button className="primary" disabled={busy || !query.trim()} onClick={search}>
              {busy ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
              检索
            </button>
          </div>
          <div className="results">
            {results.length === 0 && <div className="empty-state">输入问题后，检索结果会显示在这里。</div>}
            {results.map((result) => (
              <article className="result-card" key={`${result.filename}-${result.score}-${result.chunk.slice(0, 16)}`}>
                <div><strong>{result.filename}</strong><span>相关度 {result.score.toFixed(3)}</span></div>
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
  const [filter, setFilter] = useState("");
  useEffect(() => { void api<{ logs: AuditLog[] }>("/api/logs").then((result) => setLogs(result.logs)); }, []);
  const filtered = logs.filter((log) => `${log.event}${JSON.stringify(log.payload)}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section>
      <PageHeader eyebrow="审计" title="审计记录">
        查看模型测试、命令执行、文件处理和检索事件，定位每一次自动化动作的来源。
      </PageHeader>
      <div className="panel audit-list">
        <div className="toolbar">
          <div className="search-input"><Search size={17} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="过滤事件或 payload" /></div>
          <span>{filtered.length} / {logs.length} 条</span>
        </div>
        {filtered.length === 0 && <div className="empty-state">暂无匹配审计记录。</div>}
        {filtered.map((log) => (
          <div className="audit-row" key={log.id}>
            <span>{formatDate(log.timestamp)}</span>
            <strong>{log.event}</strong>
            <code>{JSON.stringify(log.payload)}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsView({ notify }: { notify: (toast: Toast) => void }) {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [defaultModel, setDefaultModel] = useState("deepseek-chat");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function refreshConfig() {
    const result = await api<ModelConfig>("/api/models/config");
    setConfig(result);
    setBaseUrl(result.base_url || "https://api.deepseek.com");
    setDefaultModel(result.default_model || "deepseek-chat");
  }

  useEffect(() => { void refreshConfig(); }, []);

  async function saveConfig() {
    setError("");
    setSaving(true);
    try {
      const payload: Record<string, string> = { base_url: baseUrl, default_model: defaultModel };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      const result = await api<ModelConfig>("/api/models/config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setConfig(result);
      setApiKey("");
      notify({ type: "success", text: "模型配置已保存" });
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : "保存失败";
      setError(message);
      notify({ type: "error", text: message });
    } finally {
      setSaving(false);
    }
  }

  async function testConfig() {
    setError("");
    setTesting(true);
    try {
      const result = await api<{ ok: boolean; model: string; reply: string }>("/api/models/test", { method: "POST" });
      notify({ type: "success", text: `模型测试通过：${result.model}` });
      await refreshConfig();
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : "模型测试失败";
      setError(message);
      notify({ type: "error", text: message });
    } finally {
      setTesting(false);
    }
  }

  const rows = useMemo(() => config ? [
    ["Base URL", config.base_url],
    ["默认模型", config.default_model],
    ["API Key", config.api_key_configured ? "已配置" : "未配置"],
  ] : [], [config]);

  return (
    <section>
      <PageHeader eyebrow="配置" title="模型 API 配置">
        配置聊天和 Copilot 任务使用的模型服务，保存后会写入项目根目录的环境变量文件。
      </PageHeader>
      <div className="two-column">
        <div className="panel">
          <SectionTitle icon={<KeyRound size={19} />} title="DeepSeek API" />
          <label>
            API key
            <input autoComplete="off" placeholder={config?.api_key_configured ? "已配置，输入新密钥可替换" : "sk-..."} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </label>
          <label>
            Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label>
            默认模型
            <input value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)} />
          </label>
          <div className="button-row">
            <button className="primary" disabled={saving} onClick={saveConfig}>
              {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              保存配置
            </button>
            <button className="secondary-action" disabled={testing} onClick={testConfig}>
              {testing ? <Loader2 className="spin" size={18} /> : <Zap size={18} />}
              测试模型
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="settings-grid">
          {rows.length === 0 && <div className="panel empty-state">正在读取模型配置...</div>}
          {rows.map(([key, value]) => (
            <div className="setting-card" key={key}>
              <span>{key}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
          <div className="panel checklist">
            <SectionTitle icon={<AlertTriangle size={19} />} title="运行前检查" />
            <p>API Key 配置后，建议先执行一次模型测试；Copilot 的权限请求仍会在运行中逐项确认。</p>
          </div>
        </div>
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
