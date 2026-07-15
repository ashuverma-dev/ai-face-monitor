"use client";

import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type PageKey = "dashboard" | "monitoring" | "students" | "logs" | "images" | "reports" | "settings";

type Student = {
  id: number;
  name: string;
  roll: string;
  course: string;
  images: number;
  ready: boolean;
};

type RecognitionResult = {
  status: "RECOGNIZED" | "UNKNOWN" | "NO_FACE";
  student_id?: number;
  name: string | null;
  confidence: number;
};

type RecognitionLog = {
  log_id: number;
  student_id: number | null;
  student_name: string | null;
  confidence: number;
  detection_time: string;
  status: "RECOGNIZED" | "UNKNOWN";
  image_path?: string;
};

type CaptureRecord = {
  id: number;
  name: string;
  status: "RECOGNIZED" | "UNKNOWN";
  confidence: number;
  captured_at: string;
  image_url: string;
};

type DashboardPayload = {
  stats: {
    total_students: number;
    today_detections: number;
    today_recognized: number;
    today_unknown: number;
    total_detections: number;
    avg_confidence: number;
  };
  trend: { date: string; recognized: number; unknown: number }[];
  recent: RecognitionLog[];
};

type HealthPayload = {
  status: string;
  model: string;
  database: string;
  persistence: string;
  registered_students: number;
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "https://ai-face-monitor-api-ashu.onrender.com"
).replace(/\/$/, "");

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function frameBlob(video: HTMLVideoElement, quality = 0.86): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Camera frame could not be prepared."));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Camera frame could not be captured.")), "image/jpeg", quality));
}

function formatLogTime(value: string, includeDate = false): string {
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value || "—";
  return parsed.toLocaleString([], includeDate
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });
}

const navItems: { key: PageKey; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◆" },
  { key: "monitoring", label: "Live Monitoring", icon: "◉" },
  { key: "students", label: "Students", icon: "+" },
  { key: "logs", label: "Recognition Logs", icon: "≡" },
  { key: "images", label: "Captured Images", icon: "▣" },
  { key: "reports", label: "Reports", icon: "↗" },
  { key: "settings", label: "System Settings", icon: "⚙" },
];

const initialStudents: Student[] = [
  { id: 10, name: "Ashu Verma", roll: "CS-010", course: "Computer Science", images: 20, ready: true },
  { id: 12, name: "Vijay Pal", roll: "CS-012", course: "Computer Science", images: 24, ready: true },
];

const recognitionLogs = [
  { name: "Vijay Pal", confidence: "91%", time: "12:44 PM", status: "Recognized" },
  { name: "Ashu Verma", confidence: "87%", time: "12:40 PM", status: "Recognized" },
  { name: "Unknown Face", confidence: "—", time: "12:38 PM", status: "Unknown" },
  { name: "Unknown Face", confidence: "—", time: "12:35 PM", status: "Unknown" },
  { name: "Ashu Verma", confidence: "86%", time: "11:44 AM", status: "Recognized" },
];

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="toast" role="status"><span>✓</span>{message}</div>;
}

export default function Home() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [toast, setToast] = useState("");
  const [cameraRunning, setCameraRunning] = useState(false);
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }, []);

  const navigate = (next: PageKey) => {
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraRunning(true);
      showToast("Camera started successfully");
    } catch {
      showToast("Camera permission is required");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraRunning(false);
  };

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  useEffect(() => {
    apiRequest<Student[]>("/students")
      .then(setStudents)
      .catch(() => showToast("AI server is offline. Start the Python API to use recognition."));
  }, [showToast]);

  return (
    <div className="app-shell">
      <Toast message={toast} />
      <header className="mobile-header">
        <div className="mobile-brand"><span>AI</span><strong>AI Face Monitor</strong></div>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? "×" : "☰"}</button>
      </header>

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div><strong>AI Face Monitor</strong><small>Attendance System</small></div>
        </div>
        <p className="menu-label">Main menu</p>
        <nav>
          {navItems.map((item) => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => navigate(item.key)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="system-ready"><span /> System Ready</div>
          <small>Responsive Web Preview • v1.0</small>
        </div>
      </aside>
      {menuOpen && <button className="backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <main className="main-content">
        {page === "dashboard" && <Dashboard navigate={navigate} showToast={showToast} />}
        {page === "monitoring" && (
          <Monitoring
            videoRef={videoRef}
            running={cameraRunning}
            startCamera={startCamera}
            stopCamera={stopCamera}
          />
        )}
        {page === "students" && (
          <Students
            students={students}
            setStudents={setStudents}
            openForm={() => setShowStudentForm(true)}
            openCapture={setEnrollStudent}
            showToast={showToast}
          />
        )}
        {page === "logs" && <Logs showToast={showToast} />}
        {page === "images" && <Images navigate={navigate} showToast={showToast} />}
        {page === "reports" && <Reports showToast={showToast} />}
        {page === "settings" && <Settings showToast={showToast} />}
      </main>

      {showStudentForm && (
        <StudentModal
          onClose={() => setShowStudentForm(false)}
          onSave={async (student) => {
            const saved = await apiRequest<Student>("/students", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: student.name, roll: student.roll, course: student.course }),
            });
            setStudents((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
            setShowStudentForm(false);
            showToast("Student registered. Now capture face images.");
          }}
          nextId={Math.max(...students.map((student) => student.id), 0) + 1}
        />
      )}
      {enrollStudent && (
        <EnrollmentModal
          student={enrollStudent}
          onClose={() => setEnrollStudent(null)}
          onComplete={(result) => {
            setStudents((current) => current.map((item) => item.id === enrollStudent.id ? { ...item, images: result.images, ready: result.ready } : item));
            setEnrollStudent(null);
            showToast(`${result.saved} face images saved. Recognition is ready.`);
          }}
        />
      )}
    </div>
  );
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {action}
    </div>
  );
}

function Dashboard({ navigate, showToast }: { navigate: (page: PageKey) => void; showToast: (message: string) => void }) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const [dashboardData, healthData] = await Promise.all([
        apiRequest<DashboardPayload>("/dashboard"),
        apiRequest<HealthPayload>("/health"),
      ]);
      setDashboard(dashboardData);
      setHealth(healthData);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Dashboard data could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<DashboardPayload>("/dashboard"),
      apiRequest<HealthPayload>("/health"),
    ]).then(([dashboardData, healthData]) => {
      if (!active) return;
      setDashboard(dashboardData);
      setHealth(healthData);
    }).catch((error) => {
      if (active) showToast(error instanceof Error ? error.message : "Dashboard data could not be loaded");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [showToast]);

  const stats = dashboard?.stats;
  const totalStudents = stats?.total_students || 0;
  const attendanceRate = totalStudents ? Math.round(((stats?.today_recognized || 0) / totalStudents) * 100) : 0;
  const confidence = stats?.avg_confidence || 0;
  const confidencePercent = Math.round((confidence <= 1 ? confidence * 100 : confidence));
  const cards = [
    ["Students", loading ? "—" : String(totalStudents), "Registered records", "violet"],
    ["Recognized Today", loading ? "—" : String(stats?.today_recognized || 0), "Unique attendance", "green"],
    ["Unknown Today", loading ? "—" : String(stats?.today_unknown || 0), "Review required", "red"],
    ["Avg. Confidence", loading ? "—" : `${confidencePercent}%`, "Verified matches", "lavender"],
    ["Attendance Rate", loading ? "—" : `${attendanceRate}%`, "Students present today", "purple"],
    ["All Detections", loading ? "—" : String(stats?.total_detections || 0), "Lifetime events", "orange"],
  ];
  const trend = dashboard?.trend || [];
  const trendMax = Math.max(1, ...trend.flatMap((item) => [item.recognized, item.unknown]));
  const healthCards = [
    ["API Service", health?.status === "ok" ? "Online" : "Checking"],
    ["AI Engine", health?.model === "ready" ? "Model ready" : "Available"],
    ["Database", health?.database === "online" ? "Online" : "Checking"],
    ["Private Backup", health?.persistence === "private-hub" ? "Connected" : "Local mode"],
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live attendance overview • real database data" action={<button className="ghost-button" onClick={() => { setLoading(true); void loadDashboard(); }}>↻ Refresh</button>} />
      <div className="page-body">
        <section className="hero-panel">
          <div><span className="eyebrow">Smart attendance system</span><h2>Smart attendance, made simple.</h2><p>{health?.status === "ok" ? `System ready • ${health.registered_students} registered students` : "Connecting to the AI backend..."}</p></div>
          <div className="hero-action"><span className="ready-pill">● {health?.status === "ok" ? "AI system is ready" : "Checking system"}</span><button className="primary-button" onClick={() => navigate("monitoring")}>▶ Start Monitoring</button></div>
        </section>

        <h3 className="section-title">System Health</h3>
        <section className="health-grid">
          {healthCards.map(([label, value]) => <article className="health-card" key={label}><small>{label}</small><strong><span />{value}</strong></article>)}
        </section>

        <h3 className="section-title">Today&apos;s Overview</h3>
        <section className="stats-grid">
          {cards.map(([label, value, note, color]) => <article className={`stat-card ${color}`} key={label}><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div><span className="stat-symbol">{label[0]}</span></article>)}
        </section>

        <section className="chart-card">
          <div className="card-heading"><div><h3>7-Day Attendance Trend</h3><p>Real recognition activity from the database</p></div><div className="legend"><span className="recognized-dot" />Recognized <span className="unknown-dot" />Unknown</div></div>
          <div className="chart-area">
            {trend.map((item) => {
              const day = new Date(`${item.date}T00:00:00`).toLocaleDateString([], { weekday: "short" });
              const recognizedHeight = item.recognized ? Math.max(7, (item.recognized / trendMax) * 100) : 0;
              const unknownHeight = item.unknown ? Math.max(7, (item.unknown / trendMax) * 100) : 0;
              return <div className="bar-column" key={item.date}><div className="bars" title={`${item.recognized} recognized, ${item.unknown} unknown`}><span className="unknown-bar" style={{ height: `${unknownHeight}%` }} /><span className="recognized-bar" style={{ height: `${recognizedHeight}%` }} /></div><small>{day}</small></div>;
            })}
          </div>
        </section>

        <section className="dashboard-bottom">
          <article className="panel"><div className="card-heading"><h3>Recent Activity</h3><button onClick={() => navigate("logs")}>View all</button></div>{dashboard?.recent.length ? dashboard.recent.slice(0, 4).map((log) => <div className="activity-row" key={log.log_id}><span className={log.status === "RECOGNIZED" ? "good" : "bad"}>●</span><strong>{log.status === "UNKNOWN" ? "Unknown Face" : log.student_name}</strong><small>{formatLogTime(log.detection_time)}</small></div>) : <div className="empty-list">{loading ? "Loading activity..." : "No recognition activity yet."}</div>}</article>
          <article className="panel quick-actions"><h3>Quick Actions</h3><button onClick={() => navigate("students")}>+ Register a Student</button><button onClick={() => navigate("logs")}>≡ Review Logs</button><button onClick={() => navigate("reports")}>↗ Generate Reports</button></article>
        </section>
      </div>
    </>
  );
}

function Monitoring({ videoRef, running, startCamera, stopCamera }: { videoRef: RefObject<HTMLVideoElement | null>; running: boolean; startCamera: () => void; stopCamera: () => void }) {
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [summary, setSummary] = useState({ recognized: 0, unknown: 0, captures: 0 });
  const [recent, setRecent] = useState<string[]>([]);
  const requestActive = useRef(false);

  useEffect(() => {
    if (!running) return;
    const recognize = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || requestActive.current) return;
      requestActive.current = true;
      try {
        const blob = await frameBlob(video);
        const form = new FormData();
        form.append("image", blob, "camera.jpg");
        const next = await apiRequest<RecognitionResult>("/recognize", { method: "POST", body: form });
        setResult(next);
        if (next.status === "RECOGNIZED") {
          setSummary((value) => ({ ...value, recognized: value.recognized + 1, captures: value.captures + 1 }));
          setRecent((items) => [`${next.name} • ${Math.round(next.confidence * 100)}%`, ...items].slice(0, 5));
        } else if (next.status === "UNKNOWN") {
          setSummary((value) => ({ ...value, unknown: value.unknown + 1, captures: value.captures + 1 }));
        }
      } catch (error) {
        setResult({ status: "NO_FACE", name: error instanceof Error ? error.message : "AI server unavailable", confidence: 0 });
      } finally {
        requestActive.current = false;
      }
    };
    recognize();
    const timer = window.setInterval(recognize, 1400);
    return () => window.clearInterval(timer);
  }, [running, videoRef]);

  const statusText = !running ? "Waiting" : result?.status === "RECOGNIZED" ? "Verified" : result?.status === "UNKNOWN" ? "Unknown face" : result?.name?.toLowerCase().includes("server") ? "AI server offline" : "Looking for a face";
  const displayName = !running ? "—" : result?.status === "NO_FACE" ? "Scanning..." : result?.name || "Scanning...";
  return (
    <>
      <PageHeader title="Live Monitoring" subtitle="Real-time browser camera preview and attendance" action={<div className="header-actions"><span className={running ? "live-status running" : "live-status"}>● {running ? "Running" : "Stopped"}</span><button className="primary-button small" onClick={running ? stopCamera : startCamera}>{running ? "■ Stop" : "▶ Start"}</button></div>} />
      <div className="monitor-layout page-body">
        <section className="camera-card">
          <video ref={videoRef} autoPlay playsInline muted />
          {!running && <div className="camera-placeholder"><span>◉</span><strong>Camera is ready</strong><p>Click Start to begin the browser camera preview</p></div>}
          {running && <div className="scanner-line" />}
        </section>
        <aside className="detection-panel">
          <span className="eyebrow">Current Detection</span><h2 className={result?.status === "RECOGNIZED" ? "detection-good" : result?.status === "UNKNOWN" ? "detection-bad" : ""}>{displayName}</h2><p>Confidence: {result?.status === "RECOGNIZED" ? `${Math.round(result.confidence * 100)}%` : "—"}</p><p>Status: {statusText}</p>
          <hr /><h3>Session Summary</h3><div className="metric-line good"><span>Recognized</span><strong>{summary.recognized}</strong></div><div className="metric-line bad"><span>Unknown</span><strong>{summary.unknown}</strong></div><div className="metric-line"><span>Captures</span><strong>{summary.captures}</strong></div>
          <hr /><h3>Recent Recognitions</h3>{recent.length ? recent.map((item, index) => <div className="recent-detection" key={`${item}-${index}`}>{item}</div>) : <div className="empty-list">Recognition events will appear here.</div>}
        </aside>
      </div>
    </>
  );
}

function Students({ students, setStudents, openForm, openCapture, showToast }: { students: Student[]; setStudents: Dispatch<SetStateAction<Student[]>>; openForm: () => void; openCapture: (student: Student) => void; showToast: (message: string) => void }) {
  const removeStudent = async (student: Student) => {
    if (!window.confirm(`Delete ${student.name} and all saved face data?`)) return;
    try {
      await apiRequest<{ deleted: boolean }>(`/students/${student.id}`, { method: "DELETE" });
      setStudents((all) => all.filter((item) => item.id !== student.id));
      showToast("Student and face data deleted");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Student could not be deleted");
    }
  };
  return (
    <>
      <PageHeader title="Student Management" subtitle="Register students and manage face profiles" action={<button className="primary-button small" onClick={openForm}>+ Add Student</button>} />
      <div className="page-body"><section className="panel students-panel"><div className="card-heading"><div><h3>Registered Students</h3><p>{students.length} student profiles</p></div><input className="search-input" placeholder="Search students..." /></div><div className="student-list">{students.map((student) => <article className="student-row" key={student.id}><div className="avatar">{student.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="student-info"><strong>{student.name}</strong><p>{student.roll} • {student.course}</p></div><span className={student.ready ? "ready-badge" : "ready-badge pending"}>● {student.ready ? "Ready" : "Face needed"} • {student.images} images</span><div className="row-actions"><button onClick={() => openCapture(student)}>Capture</button><button className="danger-link" onClick={() => removeStudent(student)}>Delete</button></div></article>)}</div></section></div>
    </>
  );
}

function Logs({ showToast }: { showToast: (message: string) => void }) {
  const [logs, setLogs] = useState<RecognitionLog[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      setLogs(await apiRequest<RecognitionLog[]>("/logs?limit=500"));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Recognition logs could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    apiRequest<RecognitionLog[]>("/logs?limit=500")
      .then((data) => { if (active) setLogs(data); })
      .catch((error) => { if (active) showToast(error instanceof Error ? error.message : "Recognition logs could not be loaded"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showToast]);

  const visibleLogs = logs.filter((log) => {
    const matchesName = (log.student_name || "Unknown Face").toLowerCase().includes(search.toLowerCase());
    return matchesName && (status === "ALL" || log.status === status);
  });

  const removeLog = async (log: RecognitionLog) => {
    if (!window.confirm("Delete this recognition record?")) return;
    try {
      await apiRequest<{ deleted: boolean }>(`/logs/${log.log_id}`, { method: "DELETE" });
      setLogs((current) => current.filter((item) => item.log_id !== log.log_id));
      showToast("Recognition record deleted");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Recognition record could not be deleted");
    }
  };

  const clearLogs = async () => {
    if (!logs.length || !window.confirm("Delete all recognition logs and their captured images?")) return;
    try {
      await apiRequest<{ deleted: number }>("/logs", { method: "DELETE" });
      setLogs([]);
      showToast("All recognition logs deleted");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Recognition logs could not be cleared");
    }
  };

  return (
    <>
      <PageHeader
        title="Recognition Logs"
        subtitle="Search and review attendance activity"
        action={<div className="header-actions"><button className="ghost-button" onClick={() => { setLoading(true); void loadLogs(); }}>↻ Refresh</button><button className="danger-button" onClick={() => void clearLogs()} disabled={!logs.length}>Delete All</button></div>}
      />
      <div className="page-body">
        <section className="panel">
          <div className="filter-row">
            <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by student name..." />
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter recognition status"><option value="ALL">All activity</option><option value="RECOGNIZED">Recognized</option><option value="UNKNOWN">Unknown</option></select>
          </div>
          <div className="responsive-table"><table><thead><tr><th>Student</th><th>Confidence</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {visibleLogs.map((log) => <tr key={log.log_id}><td>{log.status === "UNKNOWN" ? "Unknown Face" : log.student_name}</td><td>{log.status === "RECOGNIZED" ? `${Math.round(log.confidence * 100)}%` : "—"}</td><td>{formatLogTime(log.detection_time, true)}</td><td><span className={log.status === "RECOGNIZED" ? "table-status success" : "table-status unknown"}>{log.status === "RECOGNIZED" ? "Recognized" : "Unknown"}</span></td><td><button className="table-delete" onClick={() => void removeLog(log)}>Delete</button></td></tr>)}
            {!visibleLogs.length && <tr><td className="table-empty" colSpan={5}>{loading ? "Loading recognition logs..." : "No matching recognition activity found."}</td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </>
  );
}

function Images({ navigate, showToast }: { navigate: (page: PageKey) => void; showToast: (message: string) => void }) {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCaptures = useCallback(async () => {
    try {
      setCaptures(await apiRequest<CaptureRecord[]>("/captures?limit=200"));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Captured images could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    apiRequest<CaptureRecord[]>("/captures?limit=200")
      .then((data) => { if (active) setCaptures(data); })
      .catch((error) => { if (active) showToast(error instanceof Error ? error.message : "Captured images could not be loaded"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showToast]);

  const removeCapture = async (capture: CaptureRecord) => {
    if (!window.confirm("Delete this captured image? The recognition log will be kept.")) return;
    try {
      await apiRequest<{ deleted: boolean }>(`/captures/${capture.id}`, { method: "DELETE" });
      setCaptures((current) => current.filter((item) => item.id !== capture.id));
      showToast("Captured image deleted");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Captured image could not be deleted");
    }
  };

  return <>
    <PageHeader title="Captured Images" subtitle="Review evidence frames saved with recognition activity" action={<button className="ghost-button" onClick={() => { setLoading(true); void loadCaptures(); }}>↻ Refresh</button>} />
    <div className="page-body">
      {captures.length ? <section className="capture-grid">{captures.map((capture) => <article className="capture-card" key={capture.id}>
        <a href={`${API_URL}${capture.image_url}`} target="_blank" rel="noreferrer" className="capture-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${API_URL}${capture.image_url}`} alt={`${capture.name} recognition capture`} loading="lazy" />
        </a>
        <div className="capture-info"><div><strong>{capture.status === "UNKNOWN" ? "Unknown Face" : capture.name}</strong><p>{formatLogTime(capture.captured_at, true)} · {capture.status === "RECOGNIZED" ? `${Math.round(capture.confidence * 100)}% confidence` : "Review required"}</p></div><span className={capture.status === "RECOGNIZED" ? "table-status success" : "table-status unknown"}>{capture.status === "RECOGNIZED" ? "Recognized" : "Unknown"}</span></div>
        <div className="capture-actions"><a href={`${API_URL}${capture.image_url}`} target="_blank" rel="noreferrer">View Full</a><button onClick={() => void removeCapture(capture)}>Delete</button></div>
      </article>)}</section> : <section className="empty-state panel"><div>▣</div><h2>{loading ? "Loading captures..." : "No web captures yet"}</h2><p>{loading ? "Connecting to the recognition backend." : "Start Live Monitoring. The next throttled recognized or unknown event will be saved here."}</p>{!loading && <button className="primary-button" onClick={() => navigate("monitoring")}>Open Live Monitoring</button>}</section>}
    </div>
  </>;
}

function Reports({ showToast }: { showToast: (message: string) => void }) {
  const downloadCsv = () => {
    const rows = ["Student,Confidence,Time,Status", ...recognitionLogs.map((log) => `${log.name},${log.confidence},${log.time},${log.status}`)];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "recognition-report.csv"; link.click(); URL.revokeObjectURL(url); showToast("Report downloaded successfully");
  };
  return <><PageHeader title="Reports" subtitle="Create and download attendance reports" /><div className="page-body"><div className="report-grid"><article className="report-card"><span>Today</span><h2>Daily Report</h2><p>Download today&apos;s recognition activity and attendance summary.</p><div><button className="primary-button" onClick={downloadCsv}>Download CSV ↗</button><button className="ghost-button" onClick={() => showToast("PDF export will connect to the Python backend")}>PDF Report</button></div></article><article className="report-card"><span>This Month</span><h2>Monthly Report</h2><p>Download a complete monthly summary for registered students.</p><div><button className="primary-button" onClick={downloadCsv}>Download CSV ↗</button><button className="ghost-button" onClick={() => showToast("PDF export will connect to the Python backend")}>PDF Report</button></div></article></div><section className="panel generated-files"><div className="card-heading"><div><h3>Generated Files</h3><p>Your browser downloads will be listed by the device.</p></div></div><div className="file-row"><span>↗</span><div><strong>Recognition report</strong><p>Ready to generate</p></div><button onClick={downloadCsv}>Download</button></div></section></div></>;
}

function Settings({ showToast }: { showToast: (message: string) => void }) {
  const [threshold, setThreshold] = useState(50);
  return <><PageHeader title="System Settings" subtitle="Configure recognition and web preferences" /><div className="page-body settings-grid"><section className="panel setting-card"><span className="eyebrow">Recognition</span><h2>Matching Threshold</h2><p>Adjust how strict face matching should be.</p><div className="range-label"><span>Balanced</span><strong>{threshold}%</strong></div><input type="range" min="30" max="95" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></section><section className="panel setting-card"><span className="eyebrow">Camera</span><h2>Browser Camera</h2><p>Camera permission is requested only when Live Monitoring starts.</p><label className="switch-row"><span>Mirror preview</span><input type="checkbox" defaultChecked /></label><label className="switch-row"><span>Show scan effect</span><input type="checkbox" defaultChecked /></label></section><section className="panel setting-card"><span className="eyebrow">Data</span><h2>Web Preview Data</h2><p>This first web version keeps demo data on the current device.</p><button className="primary-button" onClick={() => showToast("Settings saved on this device")}>Save Settings</button></section><section className="panel setting-card system-info"><span className="eyebrow">System</span><h2>Technology</h2><p>Responsive React interface prepared for a Python recognition API.</p><ul><li>Responsive web frontend</li><li>Browser camera access</li><li>Python API ready architecture</li></ul></section></div></>;
}

function StudentModal({ onClose, onSave, nextId }: { onClose: () => void; onSave: (student: Student) => Promise<void>; nextId: number }) {
  const [name, setName] = useState(""); const [roll, setRoll] = useState(""); const [course, setCourse] = useState("Computer Science");
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try { await onSave({ id: nextId, name, roll, course, images: 0, ready: false }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Student could not be saved."); setSaving(false); }
  };
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">New Profile</span><h2>Register Student</h2></div><button type="button" onClick={onClose}>×</button></div><label>Student name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter full name" required /></label><label>Roll number<input value={roll} onChange={(event) => setRoll(event.target.value)} placeholder="Enter roll number" required /></label><label>Department<select value={course} onChange={(event) => setCourse(event.target.value)}><option>Computer Science</option><option>Information Technology</option><option>Business Administration</option><option>Other</option></select></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Register Student"}</button></div></form></div>;
}

function EnrollmentModal({ student, onClose, onComplete }: { student: Student; onClose: () => void; onComplete: (result: { saved: number; images: number; ready: boolean }) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [frames, setFrames] = useState<Blob[]>([]);
  const [status, setStatus] = useState("Starting camera...");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((stream) => {
        if (!active) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("Center your face and capture 6 clear angles.");
      })
      .catch(() => setStatus("Camera permission is required."));
    return () => { active = false; streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  const capture = async () => {
    if (!videoRef.current || frames.length >= 8) return;
    try {
      const blob = await frameBlob(videoRef.current, 0.92);
      setFrames((items) => [...items, blob]);
      setStatus(frames.length + 1 >= 6 ? "Enough images captured. Save the face profile." : "Good. Turn your head slightly and capture again.");
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : "Capture failed."); }
  };

  const upload = async () => {
    if (frames.length < 3) return setStatus("Capture at least 3 clear face images.");
    setUploading(true); setStatus("AI is checking and saving the face profile...");
    const form = new FormData();
    frames.forEach((frame, index) => form.append("images", frame, `face-${index + 1}.jpg`));
    try {
      const result = await apiRequest<{ saved: number; images: number; ready: boolean }>(`/students/${student.id}/enroll`, { method: "POST", body: form });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      onComplete(result);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Face images could not be saved.");
      setUploading(false);
    }
  };

  return <div className="modal-backdrop"><div className="modal enrollment-modal"><div className="modal-heading"><div><span className="eyebrow">AI Face Enrollment</span><h2>{student.name}</h2></div><button type="button" onClick={onClose}>×</button></div><div className="enrollment-camera"><video ref={videoRef} autoPlay playsInline muted /><div className="face-guide" /></div><p className="enrollment-status">{status}</p><div className="capture-progress"><span style={{ width: `${Math.min(frames.length / 6, 1) * 100}%` }} /></div><div className="enrollment-count">{frames.length} / 6 images</div><div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setFrames([])} disabled={!frames.length || uploading}>Reset</button><button type="button" className="ghost-button" onClick={capture} disabled={uploading || frames.length >= 8}>Capture</button><button type="button" className="primary-button" onClick={upload} disabled={frames.length < 3 || uploading}>{uploading ? "AI Processing..." : "Save Face Profile"}</button></div></div></div>;
}
