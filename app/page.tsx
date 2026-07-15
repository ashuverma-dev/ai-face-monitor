"use client";

import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
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

const trendData = [
  { day: "Wed", recognized: 35, unknown: 15 },
  { day: "Thu", recognized: 52, unknown: 10 },
  { day: "Fri", recognized: 44, unknown: 20 },
  { day: "Sat", recognized: 18, unknown: 8 },
  { day: "Sun", recognized: 12, unknown: 4 },
  { day: "Mon", recognized: 70, unknown: 18 },
  { day: "Tue", recognized: 62, unknown: 22 },
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

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
        {page === "dashboard" && <Dashboard navigate={navigate} />}
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
            showToast={showToast}
          />
        )}
        {page === "logs" && <Logs />}
        {page === "images" && <Images />}
        {page === "reports" && <Reports showToast={showToast} />}
        {page === "settings" && <Settings showToast={showToast} />}
      </main>

      {showStudentForm && (
        <StudentModal
          onClose={() => setShowStudentForm(false)}
          onSave={(student) => {
            setStudents((current) => [...current, student]);
            setShowStudentForm(false);
            showToast("Student registered successfully");
          }}
          nextId={Math.max(...students.map((student) => student.id), 0) + 1}
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

function Dashboard({ navigate }: { navigate: (page: PageKey) => void }) {
  const cards = [
    ["Students", "2", "Registered records", "violet"],
    ["Recognized Today", "2", "Unique attendance", "green"],
    ["Unknown Today", "6", "Review required", "red"],
    ["Avg. Confidence", "87%", "Verified matches", "lavender"],
    ["Attendance Rate", "100%", "Students present today", "purple"],
    ["All Detections", "12", "Lifetime events", "orange"],
  ];
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Tuesday, 15 July • Live attendance overview" action={<button className="ghost-button" onClick={() => window.location.reload()}>↻ Refresh</button>} />
      <div className="page-body">
        <section className="hero-panel">
          <div><span className="eyebrow">Smart attendance system</span><h2>Smart attendance, made simple.</h2><p>System ready • all registered students are ready for recognition</p></div>
          <div className="hero-action"><span className="ready-pill">● AI system is ready</span><button className="primary-button" onClick={() => navigate("monitoring")}>▶ Start Monitoring</button></div>
        </section>

        <h3 className="section-title">System Health</h3>
        <section className="health-grid">
          {["AI Engine", "Database", "Face Dataset", "Camera"].map((label, index) => (
            <article className="health-card" key={label}><small>{label}</small><strong><span />{index === 2 ? "2/2 ready" : index === 3 ? "Configured" : index === 0 ? "Models ready" : "Online"}</strong></article>
          ))}
        </section>

        <h3 className="section-title">Today&apos;s Overview</h3>
        <section className="stats-grid">
          {cards.map(([label, value, note, color]) => (
            <article className={`stat-card ${color}`} key={label}><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div><span className="stat-symbol">{label[0]}</span></article>
          ))}
        </section>

        <section className="chart-card">
          <div className="card-heading"><div><h3>7-Day Attendance Trend</h3><p>Recent recognition activity</p></div><div className="legend"><span className="recognized-dot" />Recognized <span className="unknown-dot" />Unknown</div></div>
          <div className="chart-area">
            {trendData.map((item) => (
              <div className="bar-column" key={item.day}><div className="bars"><span className="unknown-bar" style={{ height: `${item.unknown}%` }} /><span className="recognized-bar" style={{ height: `${item.recognized}%` }} /></div><small>{item.day}</small></div>
            ))}
          </div>
        </section>

        <section className="dashboard-bottom">
          <article className="panel"><div className="card-heading"><h3>Recent Activity</h3><button onClick={() => navigate("logs")}>View all</button></div>{recognitionLogs.slice(0, 4).map((log) => <div className="activity-row" key={log.name + log.time}><span className={log.status === "Recognized" ? "good" : "bad"}>●</span><strong>{log.name}</strong><small>{log.time}</small></div>)}</article>
          <article className="panel quick-actions"><h3>Quick Actions</h3><button onClick={() => navigate("students")}>+ Register a Student</button><button onClick={() => navigate("logs")}>≡ Review Logs</button><button onClick={() => navigate("reports")}>↗ Generate Reports</button></article>
        </section>
      </div>
    </>
  );
}

function Monitoring({ videoRef, running, startCamera, stopCamera }: { videoRef: RefObject<HTMLVideoElement | null>; running: boolean; startCamera: () => void; stopCamera: () => void }) {
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
          <span className="eyebrow">Current Detection</span><h2>{running ? "Scanning..." : "—"}</h2><p>Confidence: —</p><p>Status: {running ? "Camera active" : "Waiting"}</p>
          <hr /><h3>Session Summary</h3><div className="metric-line good"><span>Recognized</span><strong>0</strong></div><div className="metric-line bad"><span>Unknown</span><strong>0</strong></div><div className="metric-line"><span>Captures</span><strong>0</strong></div>
          <hr /><h3>Recent Recognitions</h3><div className="empty-list">Recognition events will appear here.</div>
        </aside>
      </div>
    </>
  );
}

function Students({ students, setStudents, openForm, showToast }: { students: Student[]; setStudents: Dispatch<SetStateAction<Student[]>>; openForm: () => void; showToast: (message: string) => void }) {
  return (
    <>
      <PageHeader title="Student Management" subtitle="Register students and manage face profiles" action={<button className="primary-button small" onClick={openForm}>+ Add Student</button>} />
      <div className="page-body"><section className="panel students-panel"><div className="card-heading"><div><h3>Registered Students</h3><p>{students.length} student profiles</p></div><input className="search-input" placeholder="Search students..." /></div><div className="student-list">{students.map((student) => <article className="student-row" key={student.id}><div className="avatar">{student.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="student-info"><strong>{student.name}</strong><p>{student.roll} • {student.course}</p></div><span className="ready-badge">● Ready • {student.images} images</span><div className="row-actions"><button onClick={() => showToast("Capture will use the desktop AI backend")}>Capture</button><button className="danger-link" onClick={() => { setStudents((all) => all.filter((item) => item.id !== student.id)); showToast("Student removed from this web preview"); }}>Delete</button></div></article>)}</div></section></div>
    </>
  );
}

function Logs() {
  return (
    <><PageHeader title="Recognition Logs" subtitle="Search and review attendance activity" action={<button className="ghost-button">↻ Refresh</button>} /><div className="page-body"><section className="panel"><div className="filter-row"><input className="search-input" placeholder="Search by student name..." /><select aria-label="Filter recognition status"><option>All activity</option><option>Recognized</option><option>Unknown</option></select></div><div className="responsive-table"><table><thead><tr><th>Student</th><th>Confidence</th><th>Time</th><th>Status</th></tr></thead><tbody>{recognitionLogs.map((log, index) => <tr key={index}><td>{log.name}</td><td>{log.confidence}</td><td>{log.time}</td><td><span className={log.status === "Recognized" ? "table-status success" : "table-status unknown"}>{log.status}</span></td></tr>)}</tbody></table></div></section></div></>
  );
}

function Images() {
  return <><PageHeader title="Captured Images" subtitle="View saved recognition images by date" action={<button className="ghost-button">All Dates⌄</button>} /><div className="page-body"><section className="empty-state panel"><div>▣</div><h2>No web captures yet</h2><p>Images captured through the connected recognition backend will appear here.</p><button className="primary-button">Open Live Monitoring</button></section></div></>;
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

function StudentModal({ onClose, onSave, nextId }: { onClose: () => void; onSave: (student: Student) => void; nextId: number }) {
  const [name, setName] = useState(""); const [roll, setRoll] = useState(""); const [course, setCourse] = useState("Computer Science");
  return <div className="modal-backdrop"><form className="modal" onSubmit={(event) => { event.preventDefault(); if (name && roll) onSave({ id: nextId, name, roll, course, images: 0, ready: false }); }}><div className="modal-heading"><div><span className="eyebrow">New Profile</span><h2>Register Student</h2></div><button type="button" onClick={onClose}>×</button></div><label>Student name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter full name" required /></label><label>Roll number<input value={roll} onChange={(event) => setRoll(event.target.value)} placeholder="Enter roll number" required /></label><label>Department<select value={course} onChange={(event) => setCourse(event.target.value)}><option>Computer Science</option><option>Information Technology</option><option>Business Administration</option><option>Other</option></select></label><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Register Student</button></div></form></div>;
}
