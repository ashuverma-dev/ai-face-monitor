"use client";

import Image from "next/image";
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
  portal_enabled?: boolean;
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

type AuthMode = "checking" | "setup" | "login" | "unavailable" | "authenticated";
type UserRole = "admin" | "student";

type AuthToken = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  role?: UserRole;
  username?: string;
  recovery_code?: string;
};

type StudentPortalPayload = {
  student: { id: number; name: string; roll: string; course: string; semester: string };
  summary: { recorded_days: number; this_month: number; total_check_ins: number; last_seen: string | null };
  attendance: { id: number; confidence: number; detected_at: string; status: string }[];
};

type AppPreferences = {
  threshold: number;
  mirrorPreview: boolean;
  scanEffect: boolean;
};

type AuditEntry = { id: string; action: string; details: string; created_at: string };
type AdminAccount = { username: string; created_at: string; recovery_ready: boolean; recovery_code?: string };
type AttendanceRecord = { student_id: number; student_name: string; roll_number: string; department: string; attendance_date: string; status: "PRESENT" | "ABSENT"; source: "AI" | "MANUAL" | "NOT_RECORDED"; first_seen: string | null; updated_by: string | null };
type LivenessChallenge = { challenge_id: string; sequence: ("LEFT" | "RIGHT" | "CENTER")[]; step: number; expires_in: number; checks?: string[] };
type LivenessCheck = { face: boolean; pose: "LEFT" | "RIGHT" | "CENTER" | "NONE"; step: number; complete: boolean; expected?: "LEFT" | "RIGHT" | "CENTER"; liveness_token?: string; reason?: string; anti_spoof?: string; quality?: { brightness: number; sharpness: number; face_ratio?: number } };
type AttendancePercentages = { month: string; total_days: number; students: { student_id: number; name: string; roll: string; department: string; present_days: number; total_days: number; percentage: number }[] };
type AlertSettings = { enabled: boolean; low_percentage: number; email_recipient: string; send_absent: boolean; email_available: boolean };

const TOKEN_KEY = "face-monitor-session-token";
const ROLE_KEY = "face-monitor-session-role";
const PREFERENCES_KEY = "face-monitor-preferences";
const DEFAULT_PREFERENCES: AppPreferences = { threshold: 50, mirrorPreview: true, scanEffect: true };

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "https://ai-face-monitor-api-ashu.onrender.com"
).replace(/\/$/, "");

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem("face-monitor-admin-token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && typeof window !== "undefined" && !path.endsWith("/auth/login") && path !== "/auth/recovery/reset") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(ROLE_KEY);
      window.localStorage.removeItem("face-monitor-admin-token");
      window.dispatchEvent(new Event("face-monitor-auth-expired"));
    }
    throw new Error(payload?.detail || `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem("face-monitor-admin-token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) {
    if (response.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(ROLE_KEY);
      window.localStorage.removeItem("face-monitor-admin-token");
      window.dispatchEvent(new Event("face-monitor-auth-expired"));
    }
    throw new Error(`Image request failed (${response.status})`);
  }
  return response.blob();
}

async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  const token = window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem("face-monitor-admin-token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(ROLE_KEY);
      window.dispatchEvent(new Event("face-monitor-auth-expired"));
    }
    throw new Error(payload?.detail || `Report download failed (${response.status})`);
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "attendance-report";
  return { blob: await response.blob(), filename };
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

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="toast" role="status"><span>✓</span>{message}</div>;
}

function AuthScreen({
  mode,
  connectionError,
  slowConnection,
  onRetry,
  onAuthenticated,
}: {
  mode: AuthMode;
  connectionError: string;
  slowConnection: boolean;
  onRetry: () => void;
  onAuthenticated: (role: UserRole, username?: string) => void;
}) {
  const [loginRole, setLoginRole] = useState<UserRole>("admin");
  const [username, setUsername] = useState("admin");
  const [roll, setRoll] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (mode === "checking") {
    return <main className="auth-shell"><section className="auth-card auth-loading" aria-live="polite"><div className="auth-mark">AI</div><h1>Checking secure session</h1><p>{slowConnection ? "The AI server is waking up. This can take up to 30 seconds on the first visit." : "Connecting to the protected attendance system..."}</p><div className="auth-progress"><span /></div>{slowConnection && <small className="auth-wakeup-note">Please keep this page open.</small>}</section></main>;
  }

  if (mode === "unavailable") {
    return <main className="auth-shell"><section className="auth-card auth-loading auth-unavailable" role="alert"><div className="auth-mark">!</div><span className="eyebrow">Connection problem</span><h1>AI server is not responding</h1><p>{connectionError || "The attendance server could not be reached."}</p><button className="primary-button auth-retry" type="button" onClick={onRetry}>Try Again</button><small>Your data is safe. No attendance action was performed.</small></section></main>;
  }

  const isSetup = mode === "setup";
  const activeRole: UserRole = isSetup ? "admin" : loginRole;
  const isRecovery = !isSetup && activeRole === "admin" && recovering;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if ((isSetup || isRecovery) && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const path = isRecovery ? "/auth/recovery/reset" : isSetup ? "/auth/setup" : activeRole === "student" ? "/student/auth/login" : "/auth/login";
      const body = isRecovery ? { username, recovery_code: recoveryCode, new_password: password } : activeRole === "student" ? { roll, password } : { username, password };
      const token = await apiRequest<AuthToken>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      window.localStorage.setItem(TOKEN_KEY, token.access_token);
      window.localStorage.setItem(ROLE_KEY, activeRole);
      window.localStorage.removeItem("face-monitor-admin-token");
      onAuthenticated(activeRole, token.username || username);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed.");
      setSubmitting(false);
    }
  };

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand"><div className="auth-mark">AI</div><div><span>Secure administration</span><strong>AI Face Monitor</strong></div></div>
      {!isSetup && <div className="auth-role-tabs" role="tablist" aria-label="Choose login type">
        <button type="button" role="tab" aria-selected={loginRole === "admin"} className={loginRole === "admin" ? "active" : ""} onClick={() => { setLoginRole("admin"); setRecovering(false); setError(""); }}>Teacher / Admin</button>
        <button type="button" role="tab" aria-selected={loginRole === "student"} className={loginRole === "student" ? "active" : ""} onClick={() => { setLoginRole("student"); setRecovering(false); setError(""); }}>Student</button>
      </div>}
      <div className="auth-copy"><span className="eyebrow">{isSetup ? "First-time security setup" : activeRole === "student" ? "Private student access" : isRecovery ? "Secure account recovery" : "Protected admin access"}</span><h1>{isSetup ? "Create Admin Password" : activeRole === "student" ? "Student Portal" : isRecovery ? "Reset Admin Password" : "Welcome back"}</h1><p>{isSetup ? "Create a strong password to protect students, recognition logs, captured images and delete actions." : activeRole === "student" ? "Use the roll number and portal password provided by your teacher." : isRecovery ? "Use the recovery code previously saved from System Settings." : "Enter your teacher/admin account details to open the dashboard."}</p></div>
      <form className="auth-form" onSubmit={submit}>
        {activeRole === "admin" ? <label>Admin username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" aria-label="Admin username" required /></label> : <label>Roll number<input value={roll} onChange={(event) => setRoll(event.target.value)} autoComplete="username" placeholder="Enter your roll number" required /></label>}
        {isRecovery && <label>Recovery code<input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} autoComplete="one-time-code" placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX" required /></label>}
        <label>{isRecovery ? "New password" : "Password"}<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSetup || isRecovery ? "new-password" : "current-password"} placeholder={isRecovery ? "Create a new secure password" : "Enter secure password"} minLength={activeRole === "student" ? 8 : 12} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div></label>
        {(isSetup || isRecovery) && <label>Confirm password<div className="password-field"><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Enter password again" minLength={12} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide confirmed password" : "Show confirmed password"}>{showPassword ? "Hide" : "Show"}</button></div></label>}
        {(isSetup || isRecovery) && <p className="password-rule">Minimum 12 characters with uppercase, lowercase, number and special character.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" type="submit" disabled={submitting}>{submitting ? "Please wait..." : isRecovery ? "Reset Password" : isSetup ? "Create Secure Admin" : activeRole === "student" ? "Open My Attendance" : "Log in securely"}</button>
        {!isSetup && activeRole === "admin" && <button className="auth-text-button" type="button" onClick={() => { setRecovering((value) => !value); setError(""); setPassword(""); setConfirmPassword(""); }}>{isRecovery ? "Back to admin login" : "Forgot password?"}</button>}
      </form>
      <div className="auth-security"><span>✓</span><p>{activeRole === "student" ? "You can only view your own profile and attendance." : "Password hashing • signed 8-hour session • protected private data"}</p></div>
    </section>
  </main>;
}

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [authRetry, setAuthRetry] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const [slowConnection, setSlowConnection] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [page, setPage] = useState<PageKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [toast, setToast] = useState("");
  const [cameraRunning, setCameraRunning] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);
  const [portalStudent, setPortalStudent] = useState<Student | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    try {
      const saved = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || "null") as Partial<AppPreferences> | null;
      if (!saved) return;
      timer = window.setTimeout(() => {
        setPreferences({
          threshold: Math.max(30, Math.min(Number(saved.threshold) || DEFAULT_PREFERENCES.threshold, 95)),
          mirrorPreview: saved.mirrorPreview !== false,
          scanEffect: saved.scanEffect !== false,
        });
      }, 0);
    } catch {
      window.localStorage.removeItem(PREFERENCES_KEY);
    }
    return () => { if (timer) window.clearTimeout(timer); };
  }, []);

  const savePreferences = (next: AppPreferences) => {
    setPreferences(next);
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    showToast("Recognition and camera settings saved");
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

  useEffect(() => {
    let active = true;
    let serverReached = false;
    const controller = new AbortController();
    const slowTimer = window.setTimeout(() => {
      if (active) setSlowConnection(true);
    }, 6000);
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    const checkAuthentication = async () => {
      try {
        const status = await apiRequest<{ configured: boolean }>("/auth/status", { signal: controller.signal });
        if (!active) return;
        serverReached = true;
        window.clearTimeout(slowTimer);
        window.clearTimeout(timeout);
        setSlowConnection(false);
        if (!status.configured) {
          setAuthMode("setup");
          return;
        }
        const legacyToken = window.localStorage.getItem("face-monitor-admin-token");
        const token = window.localStorage.getItem(TOKEN_KEY) || legacyToken;
        const storedRole = (window.localStorage.getItem(ROLE_KEY) || (legacyToken ? "admin" : "")) as UserRole;
        if (!token || !["admin", "student"].includes(storedRole)) {
          setAuthMode("login");
          return;
        }
        if (legacyToken && !window.localStorage.getItem(TOKEN_KEY)) {
          window.localStorage.setItem(TOKEN_KEY, legacyToken);
          window.localStorage.setItem(ROLE_KEY, "admin");
        }
        const session = await apiRequest<{ authenticated: boolean; username?: string }>(storedRole === "student" ? "/student/auth/session" : "/auth/session");
        if (active) {
          if (storedRole === "admin") setAdminUsername(session.username || "admin");
          setRole(storedRole);
          setAuthMode("authenticated");
        }
      } catch (reason) {
        if (!active) return;
        window.clearTimeout(slowTimer);
        window.clearTimeout(timeout);
        setSlowConnection(false);
        if (serverReached) {
          setConnectionError("");
          setAuthMode("login");
          return;
        }
        setConnectionError(reason instanceof DOMException && reason.name === "AbortError"
          ? "The server took longer than 30 seconds to start. Please try again."
          : "Check your internet connection and try again. The server may be temporarily asleep.");
        setAuthMode("unavailable");
      }
    };
    void checkAuthentication();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(slowTimer);
      window.clearTimeout(timeout);
    };
  }, [authRetry]);

  useEffect(() => {
    const expireSession = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraRunning(false);
      setRole(null);
      setAuthMode("login");
    };
    window.addEventListener("face-monitor-auth-expired", expireSession);
    return () => window.removeEventListener("face-monitor-auth-expired", expireSession);
  }, []);

  useEffect(() => {
    if (authMode !== "authenticated" || role !== "admin") return;
    apiRequest<Student[]>("/students")
      .then(setStudents)
      .catch(() => showToast("AI server is offline. Start the Python API to use recognition."));
  }, [authMode, role, showToast]);

  const logout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ROLE_KEY);
    window.localStorage.removeItem("face-monitor-admin-token");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraRunning(false);
    setMenuOpen(false);
    setRole(null);
    setAuthMode("login");
  };

  if (authMode !== "authenticated") {
    return <AuthScreen
      mode={authMode}
      connectionError={connectionError}
      slowConnection={slowConnection}
      onRetry={() => {
        setConnectionError("");
        setSlowConnection(false);
        setAuthMode("checking");
        setAuthRetry((current) => current + 1);
      }}
      onAuthenticated={(authenticatedRole, username) => { setRole(authenticatedRole); if (authenticatedRole === "admin") setAdminUsername(username || "admin"); setAuthMode("authenticated"); }}
    />;
  }

  if (role === "student") {
    return <StudentPortal onLogout={logout} />;
  }

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
          <button className="logout-button" onClick={logout}>Log out</button>
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
            preferences={preferences}
          />
        )}
        {page === "students" && (
          <Students
            students={students}
            setStudents={setStudents}
            openForm={() => setShowStudentForm(true)}
            openCapture={setEnrollStudent}
            openPortal={setPortalStudent}
            showToast={showToast}
          />
        )}
        {page === "logs" && <Logs showToast={showToast} students={students} />}
        {page === "images" && <Images navigate={navigate} showToast={showToast} />}
        {page === "reports" && <Reports showToast={showToast} students={students} />}
        {page === "settings" && <Settings preferences={preferences} onSave={savePreferences} showToast={showToast} adminUsername={adminUsername} />}
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
      {portalStudent && (
        <StudentPasswordModal
          student={portalStudent}
          onClose={() => setPortalStudent(null)}
          onSaved={() => {
            setStudents((current) => current.map((item) => item.id === portalStudent.id ? { ...item, portal_enabled: true } : item));
            setPortalStudent(null);
            showToast("Student portal password saved securely.");
          }}
        />
      )}
    </div>
  );
}

function StudentPortal({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<StudentPortalPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<StudentPortalPayload>("/student/me")
      .then((payload) => { if (active) setData(payload); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Attendance could not be loaded."); });
    return () => { active = false; };
  }, []);

  if (!data) {
    return <main className="student-portal-shell"><section className="student-loading panel"><div className="auth-mark">AI</div><h1>{error || "Loading your attendance..."}</h1>{error && <button className="ghost-button" onClick={onLogout}>Back to login</button>}</section></main>;
  }

  const initials = data.student.name.split(" ").map((word) => word[0]).join("").slice(0, 2);
  return <main className="student-portal-shell">
    <header className="student-portal-header">
      <div className="mobile-brand"><span>AI</span><div><strong>Student Attendance</strong><small>Private portal</small></div></div>
      <button className="logout-button" onClick={onLogout}>Log out</button>
    </header>
    <section className="student-welcome panel">
      <div className="student-profile-avatar">{initials}</div>
      <div><span className="eyebrow">Student profile</span><h1>Welcome, {data.student.name}</h1><p>{data.student.roll} • {data.student.course}{data.student.semester ? ` • ${data.student.semester}` : ""}</p></div>
      <span className="student-private-badge">✓ Your private view</span>
    </section>
    <section className="student-summary-grid">
      <article className="panel"><span>Recorded Days</span><strong>{data.summary.recorded_days}</strong><p>Unique attendance days</p></article>
      <article className="panel"><span>This Month</span><strong>{data.summary.this_month}</strong><p>Days recorded this month</p></article>
      <article className="panel"><span>Total Check-ins</span><strong>{data.summary.total_check_ins}</strong><p>Successful face matches</p></article>
      <article className="panel"><span>Last Seen</span><strong className="student-last-seen">{data.summary.last_seen ? formatLogTime(data.summary.last_seen, true) : "Not recorded"}</strong><p>Latest attendance event</p></article>
    </section>
    <section className="panel student-attendance-card">
      <div className="card-heading"><div><h2>My Attendance History</h2><p>Only your verified recognition records are shown.</p></div><span className="student-record-count">{data.attendance.length} records</span></div>
      <div className="responsive-table"><table><thead><tr><th>Date & Time</th><th>Confidence</th><th>Status</th></tr></thead><tbody>
        {data.attendance.map((record) => <tr key={`${record.detected_at}-${record.id}`}><td>{formatLogTime(record.detected_at, true)}</td><td>{record.status === "Present" ? `${Math.round(record.confidence * 100)}%` : "—"}</td><td><span className={record.status === "Present" ? "table-status success" : "table-status unknown"}>{record.status}</span></td></tr>)}
        {!data.attendance.length && <tr><td className="table-empty" colSpan={3}>No attendance has been recorded yet.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}

function StudentPasswordModal({ student, onClose, onSaved }: { student: Student; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSaving(true); setError("");
    try {
      await apiRequest(`/students/${student.id}/portal-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Student login could not be created.");
      setSaving(false);
    }
  };

  return <div className="modal-backdrop"><form className="modal" role="dialog" aria-modal="true" aria-labelledby="student-password-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} onSubmit={submit}>
    <div className="modal-heading"><div><span className="eyebrow">Student portal access</span><h2 id="student-password-title">{student.portal_enabled ? "Reset Login Password" : "Create Student Login"}</h2></div><button type="button" onClick={onClose} aria-label="Close student password dialog">×</button></div>
    <div className="portal-student-summary"><span className="avatar">{student.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><strong>{student.name}</strong><p>Login ID: {student.roll}</p></div></div>
    <label>New password<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" placeholder="At least 8 characters" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide" : "Show"}</button></div></label>
    <label>Confirm password<div className="password-field"><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" placeholder="Enter password again" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide" : "Show"}</button></div></label>
    <p className="password-rule">Use at least 8 characters containing letters and numbers. Share it privately with this student.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving securely..." : "Save Student Login"}</button></div>
  </form></div>;
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

function Monitoring({ videoRef, running, startCamera, stopCamera, preferences }: { videoRef: RefObject<HTMLVideoElement | null>; running: boolean; startCamera: () => void; stopCamera: () => void; preferences: AppPreferences }) {
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [summary, setSummary] = useState({ recognized: 0, unknown: 0, captures: 0 });
  const [recent, setRecent] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<"idle" | "connected" | "retrying">("idle");
  const [livenessText, setLivenessText] = useState("Start camera for live face check");
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [livenessTotal, setLivenessTotal] = useState(5);
  const [environmentText, setEnvironmentText] = useState("Camera quality will appear here");
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const requestActive = useRef(false);
  const failureCount = useRef(0);
  const retryAfter = useRef(0);
  const challengeRef = useRef<LivenessChallenge | null>(null);

  useEffect(() => {
    if (!running) {
      failureCount.current = 0;
      retryAfter.current = 0;
      challengeRef.current = null;
      return;
    }
    let active = true;
    const poseInstruction = (pose: "LEFT" | "RIGHT" | "CENTER") => {
      if (pose === "CENTER") return "Look straight at the camera";
      const visiblePose = preferences.mirrorPreview ? (pose === "LEFT" ? "RIGHT" : "LEFT") : pose;
      return `Turn your head ${visiblePose.toLowerCase()}`;
    };
    const recognize = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || requestActive.current || Date.now() < retryAfter.current) return;
      requestActive.current = true;
      try {
        if (!challengeRef.current) {
          const challenge = await apiRequest<LivenessChallenge>("/liveness/start", { method: "POST" });
          challengeRef.current = challenge;
          setLivenessProgress(0);
          setLivenessTotal(challenge.sequence.length);
          setLivenessText(poseInstruction(challenge.sequence[0]));
          return;
        }
        const blob = await frameBlob(video);
        const liveForm = new FormData();
        liveForm.append("challenge_id", challengeRef.current.challenge_id);
        liveForm.append("image", blob, "liveness.jpg");
        const requestStarted = performance.now();
        const live = await apiRequest<LivenessCheck>("/liveness/check", { method: "POST", body: liveForm });
        setNetworkLatency(Math.round(performance.now() - requestStarted));
        if (!active) return;
        setLivenessProgress(live.step);
        if (live.quality) {
          const lighting = live.quality.brightness < 45 ? "Low light" : live.quality.brightness > 215 ? "Too bright" : "Lighting good";
          const focus = live.quality.sharpness < 20 ? "hold camera steady" : "camera clear";
          setEnvironmentText(`${lighting} · ${focus}`);
        }
        if (!live.complete || !live.liveness_token) {
          setLivenessText(live.reason || (!live.face ? "Keep one clear face in frame" : poseInstruction(live.expected || challengeRef.current.sequence[live.step] || "CENTER")));
          setConnectionState("connected");
          return;
        }
        setLivenessText("Live person verified");
        const form = new FormData();
        form.append("image", blob, "camera.jpg");
        form.append("threshold", String(preferences.threshold / 100));
        form.append("liveness_token", live.liveness_token);
        const next = await apiRequest<RecognitionResult>("/recognize", { method: "POST", body: form });
        if (!active) return;
        failureCount.current = 0;
        retryAfter.current = 0;
        setConnectionState("connected");
        setResult(next);
        challengeRef.current = null;
        if (next.status === "RECOGNIZED") {
          setSummary((value) => ({ ...value, recognized: value.recognized + 1, captures: value.captures + 1 }));
          setRecent((items) => [`${next.name} • ${Math.round(next.confidence * 100)}%`, ...items].slice(0, 5));
        } else if (next.status === "UNKNOWN") {
          setSummary((value) => ({ ...value, unknown: value.unknown + 1, captures: value.captures + 1 }));
        }
      } catch (error) {
        if (!active) return;
        failureCount.current += 1;
        if (failureCount.current >= 3) retryAfter.current = Date.now() + 5000;
        setConnectionState("retrying");
        challengeRef.current = null;
        setLivenessProgress(0);
        setLivenessText("Restarting live face check");
        setResult({ status: "NO_FACE", name: error instanceof Error ? error.message : "AI server unavailable", confidence: 0 });
      } finally {
        requestActive.current = false;
      }
    };
    recognize();
    const timer = window.setInterval(recognize, 1400);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [running, videoRef, preferences.threshold, preferences.mirrorPreview]);

  const startMonitoring = () => {
    failureCount.current = 0;
    retryAfter.current = 0;
    setConnectionState("idle");
    challengeRef.current = null;
    setLivenessProgress(0);
    setEnvironmentText("Checking lighting, focus and movement");
    setNetworkLatency(null);
    setLivenessText("Preparing live face check");
    startCamera();
  };

  const stopMonitoring = () => {
    failureCount.current = 0;
    retryAfter.current = 0;
    setConnectionState("idle");
    challengeRef.current = null;
    setLivenessProgress(0);
    setEnvironmentText("Camera quality will appear here");
    setNetworkLatency(null);
    setLivenessText("Start camera for live face check");
    stopCamera();
  };

  const statusText = !running ? "Waiting" : connectionState === "retrying" ? "Reconnecting to AI server" : result?.status === "RECOGNIZED" ? "Verified" : result?.status === "UNKNOWN" ? "Unknown face" : "Looking for a face";
  const displayName = !running ? "—" : result?.status === "NO_FACE" ? "Scanning..." : result?.name || "Scanning...";
  return (
    <>
      <PageHeader title="Live Monitoring" subtitle="Real-time browser camera preview and attendance" action={<div className="header-actions"><span className={running ? "live-status running" : "live-status"}>● {running ? "Running" : "Stopped"}</span><button className="primary-button small" onClick={running ? stopMonitoring : startMonitoring}>{running ? "■ Stop" : "▶ Start"}</button></div>} />
      <div className="monitor-layout page-body">
        <section className="camera-card">
          <video className={preferences.mirrorPreview ? "mirror-preview" : ""} ref={videoRef} autoPlay playsInline muted />
          {!running && <div className="camera-placeholder"><span>◉</span><strong>Camera is ready</strong><p>Click Start to begin the browser camera preview</p></div>}
          {running && preferences.scanEffect && <div className="scanner-line" />}
        </section>
        <aside className="detection-panel">
          <div className={`monitor-connection ${connectionState}`}><span />{connectionState === "retrying" ? "AI reconnecting" : connectionState === "connected" ? "AI connected" : "AI waiting"}</div>
          <div className="liveness-status"><span>Advanced live check {Math.min(livenessProgress, livenessTotal)} / {livenessTotal}</span><strong>{livenessText}</strong><div><i style={{ width: `${Math.min(livenessProgress / livenessTotal, 1) * 100}%` }} /></div><small>{environmentText}{networkLatency !== null ? ` · ${networkLatency}ms server` : ""}</small></div>
          <p className="threshold-note">Active match threshold: {preferences.threshold}%</p>
          <span className="eyebrow">Current Detection</span><h2 className={result?.status === "RECOGNIZED" ? "detection-good" : result?.status === "UNKNOWN" ? "detection-bad" : ""}>{displayName}</h2><p>Confidence: {result?.status === "RECOGNIZED" ? `${Math.round(result.confidence * 100)}%` : "—"}</p><p>Status: {statusText}</p>
          <hr /><h3>Session Summary</h3><div className="metric-line good"><span>Recognized</span><strong>{summary.recognized}</strong></div><div className="metric-line bad"><span>Unknown</span><strong>{summary.unknown}</strong></div><div className="metric-line"><span>Captures</span><strong>{summary.captures}</strong></div>
          <hr /><h3>Recent Recognitions</h3>{recent.length ? recent.map((item, index) => <div className="recent-detection" key={`${item}-${index}`}>{item}</div>) : <div className="empty-list">Recognition events will appear here.</div>}
        </aside>
      </div>
    </>
  );
}

function Students({ students, setStudents, openForm, openCapture, openPortal, showToast }: { students: Student[]; setStudents: Dispatch<SetStateAction<Student[]>>; openForm: () => void; openCapture: (student: Student) => void; openPortal: (student: Student) => void; showToast: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleStudents = normalizedSearch
    ? students.filter((student) => [student.name, student.roll, student.course].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
    : students;
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
  const importCsv = async (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.append("file", file, file.name);
    try {
      const result = await apiRequest<{ created: number; skipped: number }>("/students/import-csv", { method: "POST", body: form });
      setStudents(await apiRequest<Student[]>("/students"));
      showToast(`${result.created} students imported${result.skipped ? `, ${result.skipped} skipped` : ""}`);
    } catch (error) { showToast(error instanceof Error ? error.message : "CSV could not be imported"); }
    finally { if (csvInputRef.current) csvInputRef.current.value = ""; }
  };
  const downloadCsvTemplate = () => {
    const blob = new Blob(["name,roll,department,semester\nAsha Verma,20001,Computer Science,3\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "student-import-template.csv"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <PageHeader title="Student Management" subtitle="Register students and manage face profiles" action={<div className="student-import-actions"><input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => void importCsv(event.target.files?.[0])} /><button className="ghost-button" onClick={downloadCsvTemplate}>CSV Template</button><button className="ghost-button" onClick={() => csvInputRef.current?.click()}>Import CSV</button><button className="primary-button small" onClick={openForm}>+ Add Student</button></div>} />
      <div className="page-body"><section className="panel students-panel"><div className="card-heading"><div><h3>Registered Students</h3><p>{normalizedSearch ? `${visibleStudents.length} of ${students.length} profiles` : `${students.length} student profiles`}</p></div><div className="student-search"><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search students by name, roll number or department" placeholder="Search name, roll or department..." />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear student search">Clear</button>}</div></div><div className="student-list">{visibleStudents.map((student) => <article className="student-row" key={student.id}><div className="avatar">{student.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="student-info"><strong>{student.name}</strong><p>{student.roll} • {student.course}</p></div><span className={student.ready ? "ready-badge" : "ready-badge pending"}>● {student.ready ? "Ready" : "Face needed"} • {student.images} images</span><div className="row-actions"><button onClick={() => openPortal(student)}>{student.portal_enabled ? "Reset Login" : "Create Login"}</button><button onClick={() => openCapture(student)}>Capture</button><button className="danger-link" onClick={() => removeStudent(student)}>Delete</button></div></article>)}{!visibleStudents.length && <div className="student-no-results"><strong>No matching students</strong><p>Try a different name, roll number or department.</p><button type="button" className="ghost-button" onClick={() => setSearch("")}>Clear Search</button></div>}</div></section></div>
    </>
  );
}

function Logs({ showToast, students }: { showToast: (message: string) => void; students: Student[] }) {
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

  const correctLog = async (log: RecognitionLog, value: string) => {
    const studentId = value === "UNKNOWN" ? null : Number(value);
    try {
      const updated = await apiRequest<RecognitionLog>(`/logs/${log.log_id}/correct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: studentId }) });
      setLogs((current) => current.map((item) => item.log_id === log.log_id ? updated : item));
      showToast("Recognition record corrected");
    } catch (error) { showToast(error instanceof Error ? error.message : "Record could not be corrected"); }
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
            {visibleLogs.map((log) => <tr key={log.log_id}><td>{log.status === "UNKNOWN" ? "Unknown Face" : log.student_name}</td><td>{log.status === "RECOGNIZED" ? `${Math.round(log.confidence * 100)}%` : "—"}</td><td>{formatLogTime(log.detection_time, true)}</td><td><span className={log.status === "RECOGNIZED" ? "table-status success" : "table-status unknown"}>{log.status === "RECOGNIZED" ? "Recognized" : "Unknown"}</span></td><td><div className="log-actions"><select value={log.student_id || "UNKNOWN"} onChange={(event) => void correctLog(log, event.target.value)} aria-label={`Correct record ${log.log_id}`}><option value="UNKNOWN">Unknown</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select><button className="table-delete" onClick={() => void removeLog(log)}>Delete</button></div></td></tr>)}
            {!visibleLogs.length && <tr><td className="table-empty" colSpan={5}>{loading ? "Loading recognition logs..." : "No matching recognition activity found."}</td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </>
  );
}

function SecureCapturePreview({ capture }: { capture: CaptureRecord }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    apiBlob(capture.image_url).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }).catch(() => { if (active) setImageUrl(""); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [capture.image_url]);

  return <a href={imageUrl || undefined} target="_blank" rel="noreferrer" className="capture-preview" aria-label={`View ${capture.name} capture`}>
    {imageUrl ? <Image src={imageUrl} alt={`${capture.name} recognition capture`} width={640} height={480} unoptimized /> : <span className="capture-image-loading">Loading secure image...</span>}
  </a>;
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
        <div className="secure-capture"><SecureCapturePreview capture={capture} /></div>
        <div className="capture-info"><div><strong>{capture.status === "UNKNOWN" ? "Unknown Face" : capture.name}</strong><p>{formatLogTime(capture.captured_at, true)} · {capture.status === "RECOGNIZED" ? `${Math.round(capture.confidence * 100)}% confidence` : "Review required"}</p></div><span className={capture.status === "RECOGNIZED" ? "table-status success" : "table-status unknown"}>{capture.status === "RECOGNIZED" ? "Recognized" : "Unknown"}</span></div>
        <div className="capture-actions"><span className="capture-protected">🔒 Protected image</span><button onClick={() => void removeCapture(capture)}>Delete</button></div>
      </article>)}</section> : <section className="empty-state panel"><div>▣</div><h2>{loading ? "Loading captures..." : "No web captures yet"}</h2><p>{loading ? "Connecting to the recognition backend." : "Start Live Monitoring. The next throttled recognized or unknown event will be saved here."}</p>{!loading && <button className="primary-button" onClick={() => navigate("monitoring")}>Open Live Monitoring</button>}</section>}
    </div>
  </>;
}

function Reports({ showToast, students }: { showToast: (message: string) => void; students: Student[] }) {
  type ReportPeriod = "daily" | "monthly";
  type ReportType = "xlsx" | "pdf";
  type GeneratedReport = { period: ReportPeriod | "custom"; fileType: ReportType; filename: string; generatedAt: string };
  const [generated, setGenerated] = useState<GeneratedReport[]>([]);
  const [downloading, setDownloading] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(today);
  const [studentFilter, setStudentFilter] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [percentageMonth, setPercentageMonth] = useState(today.slice(0, 7));
  const [percentages, setPercentages] = useState<AttendancePercentages | null>(null);

  const loadAttendance = useCallback(async (dateValue: string) => {
    setAttendanceLoading(true);
    try { setAttendance(await apiRequest<AttendanceRecord[]>(`/attendance?attendance_date=${dateValue}`)); }
    catch (error) { showToast(error instanceof Error ? error.message : "Attendance could not be loaded"); }
    finally { setAttendanceLoading(false); }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAttendance(attendanceDate), 0);
    return () => window.clearTimeout(timer);
  }, [attendanceDate, loadAttendance]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      apiRequest<AttendancePercentages>(`/attendance/percentages?month=${percentageMonth}`).then(setPercentages).catch(() => setPercentages(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [percentageMonth]);

  const saveAttendance = async (record: AttendanceRecord, status: "PRESENT" | "ABSENT") => {
    try {
      await apiRequest("/attendance/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: record.student_id, attendance_date: attendanceDate, status }) });
      await loadAttendance(attendanceDate);
      showToast(`${record.student_name} marked ${status.toLowerCase()}`);
    } catch (error) { showToast(error instanceof Error ? error.message : "Attendance could not be updated"); }
  };

  const download = async (period: ReportPeriod, fileType: ReportType) => {
    const key = `${period}-${fileType}`;
    setDownloading(key);
    try {
      const { blob, filename } = await apiDownload(`/reports/${period}/${fileType}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setGenerated((current) => [{ period, fileType, filename, generatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current.filter((item) => !(item.period === period && item.fileType === fileType))]);
      showToast(`${fileType === "xlsx" ? "Excel" : "PDF"} report saved in Downloads`);
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Report could not be generated");
    } finally {
      setDownloading("");
    }
  };
  const reportCard = (period: ReportPeriod, label: string, title: string, description: string) => <article className="report-card">
    <span>{label}</span><h2>{title}</h2><p>{description}</p><div>
      <button className="primary-button" disabled={Boolean(downloading)} onClick={() => void download(period, "xlsx")}>{downloading === `${period}-xlsx` ? "Creating..." : "Excel Report ↗"}</button>
      <button className="ghost-button" disabled={Boolean(downloading)} onClick={() => void download(period, "pdf")}>{downloading === `${period}-pdf` ? "Creating..." : "PDF Report"}</button>
    </div>
  </article>;
  const downloadCustom = async (fileType: ReportType) => {
    setDownloading(`custom-${fileType}`);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (studentFilter) params.set("student_id", studentFilter);
    try {
      const { blob, filename } = await apiDownload(`/custom-reports/${fileType}?${params}`);
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setGenerated((current) => [{ period: "custom", fileType, filename, generatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current]);
      showToast("Filtered report saved in Downloads");
    } catch (error) { showToast(error instanceof Error ? error.message : "Filtered report could not be generated"); }
    finally { setDownloading(""); }
  };
  return <><PageHeader title="Reports" subtitle="Generate real attendance reports from the live database" /><div className="page-body">
    <section className="panel manual-attendance"><div className="card-heading"><div><span className="eyebrow">Official daily record</span><h2>Manual Attendance</h2><p>AI records one entry per student each day. Correct any missing student here.</p></div><label>Date<input type="date" value={attendanceDate} max={today} onChange={(event) => setAttendanceDate(event.target.value)} /></label></div><div className="attendance-totals"><span>Present <strong>{attendance.filter((item) => item.status === "PRESENT").length}</strong></span><span>Absent <strong>{attendance.filter((item) => item.status === "ABSENT").length}</strong></span></div><div className="manual-attendance-list">{attendance.map((record) => <div className="manual-attendance-row" key={record.student_id}><div><strong>{record.student_name}</strong><small>{record.roll_number} · {record.department || "No department"}</small></div><span className={`attendance-pill ${record.status.toLowerCase()}`}>{record.status}{record.source === "MANUAL" ? " · MANUAL" : ""}</span><div><button className={record.status === "PRESENT" ? "active-present" : ""} onClick={() => void saveAttendance(record, "PRESENT")}>Present</button><button className={record.status === "ABSENT" && record.source === "MANUAL" ? "active-absent" : ""} onClick={() => void saveAttendance(record, "ABSENT")}>Absent</button></div></div>)}{attendanceLoading && <div className="empty-list">Loading daily attendance...</div>}{!attendanceLoading && !attendance.length && <div className="empty-list">Register students to manage daily attendance.</div>}</div></section>
    <section className="panel custom-report"><div><span className="eyebrow">Custom report</span><h2>Filter Attendance</h2><p>Choose dates and optionally narrow the file to one student.</p></div><label>From<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>To<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} aria-label="Filter report by student"><option value="">All students</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select><div><button className="primary-button" disabled={Boolean(downloading)} onClick={() => void downloadCustom("xlsx")}>Filtered Excel</button><button className="ghost-button" disabled={Boolean(downloading)} onClick={() => void downloadCustom("pdf")}>Filtered PDF</button></div></section>
    <section className="panel percentage-panel"><div className="card-heading"><div><span className="eyebrow">Monthly performance</span><h2>Attendance Percentage</h2><p>{percentages?.total_days || 0} attendance days recorded in this month.</p></div><input type="month" value={percentageMonth} max={today.slice(0, 7)} onChange={(event) => setPercentageMonth(event.target.value)} aria-label="Attendance percentage month" /></div><div className="percentage-list">{percentages?.students.map((student) => <div key={student.student_id}><span><strong>{student.name}</strong><small>{student.roll} · {student.present_days}/{student.total_days} days</small></span><b className={student.percentage >= 75 ? "good" : student.percentage >= 50 ? "warning" : "bad"}>{student.percentage}%</b></div>)}{percentages && !percentages.students.length && <div className="empty-list">No students registered.</div>}</div></section>
    <div className="report-grid">{reportCard("daily", "Today", "Daily Report", "Download today's recognized students, unknown events and attendance summary.")}{reportCard("monthly", "This Month", "Monthly Report", "Download the current month's complete attendance activity and summary.")}</div>
    <section className="panel generated-files"><div className="card-heading"><div><h3>Generated Files</h3><p>Reports are saved in your browser&apos;s Downloads folder.</p></div><span className="report-live-badge">● Live database</span></div>
      {generated.length ? <div className="generated-file-list">{generated.map((file, index) => <div className="file-row" key={`${file.period}-${file.fileType}-${index}`}><span>{file.fileType === "pdf" ? "PDF" : "XL"}</span><div><strong>{file.filename}</strong><p>Generated at {file.generatedAt} • Saved to Downloads</p></div><button disabled={Boolean(downloading)} onClick={() => file.period === "custom" ? void downloadCustom(file.fileType) : void download(file.period, file.fileType)}>Download Again</button></div>)}</div> : <div className="report-empty"><span>↗</span><div><strong>No report generated in this session</strong><p>Choose Excel or PDF above. The file will appear here and in Downloads.</p></div></div>}
    </section>
  </div></>;
}

function Settings({ preferences, onSave, showToast, adminUsername }: { preferences: AppPreferences; onSave: (preferences: AppPreferences) => void; showToast: (message: string) => void; adminUsername: string }) {
  const [draft, setDraft] = useState(preferences);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [revealedCode, setRevealedCode] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [restorePassword, setRestorePassword] = useState("");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [alerts, setAlerts] = useState<AlertSettings>({ enabled: false, low_percentage: 75, email_recipient: "", send_absent: true, email_available: false });
  const thresholdLabel = draft.threshold >= 70 ? "Strict" : draft.threshold <= 42 ? "Flexible" : "Balanced";
  const loadAdmins = useCallback(async () => { try { setAdmins(await apiRequest<AdminAccount[]>("/auth/admins")); } catch { setAdmins([]); } }, []);
  useEffect(() => {
    apiRequest<AuditEntry[]>("/audit").then(setAudit).catch(() => setAudit([]));
    apiRequest<{ days: number }>("/settings/retention").then((value) => setRetentionDays(value.days)).catch(() => undefined);
    apiRequest<AlertSettings>("/settings/alerts").then(setAlerts).catch(() => undefined);
    const timer = window.setTimeout(() => void loadAdmins(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdmins]);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const token = await apiRequest<AuthToken>("/auth/password/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      window.localStorage.setItem(TOKEN_KEY, token.access_token); setCurrentPassword(""); setNewPassword(""); showToast("Admin password changed");
    } catch (error) { showToast(error instanceof Error ? error.message : "Password could not be changed"); }
  };
  const createAdmin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await apiRequest<AdminAccount>("/auth/admins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: newAdminUsername, password: newAdminPassword }) });
      setRevealedCode(`${created.username}: ${created.recovery_code}`); setNewAdminUsername(""); setNewAdminPassword(""); await loadAdmins(); showToast("Teacher/admin account created");
    } catch (error) { showToast(error instanceof Error ? error.message : "Admin account could not be created"); }
  };
  const removeAdmin = async (username: string) => {
    if (!window.confirm(`Delete admin account ${username}?`)) return;
    try { await apiRequest(`/auth/admins/${encodeURIComponent(username)}`, { method: "DELETE" }); await loadAdmins(); showToast("Admin account deleted"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Admin account could not be deleted"); }
  };
  const rotateRecoveryCode = async () => {
    try { const result = await apiRequest<{ recovery_code: string }>("/auth/recovery-code", { method: "POST" }); setRevealedCode(`${adminUsername}: ${result.recovery_code}`); await loadAdmins(); showToast("New recovery code generated"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Recovery code could not be generated"); }
  };
  const saveRetention = async () => {
    try { const result = await apiRequest<{ days: number; deleted: number }>("/settings/retention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: retentionDays }) }); setRetentionDays(result.days); showToast(`Retention saved${result.deleted ? `; ${result.deleted} old images removed` : ""}`); }
    catch (error) { showToast(error instanceof Error ? error.message : "Retention could not be saved"); }
  };
  const downloadBackup = async () => {
    try {
      const { blob, filename } = await apiDownload("/backup"); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Database backup saved in Downloads");
      setAudit(await apiRequest<AuditEntry[]>("/audit"));
    } catch (error) { showToast(error instanceof Error ? error.message : "Backup could not be created"); }
  };
  const restoreBackup = async (file: File) => {
    if (!restorePassword) return showToast("Enter current admin password first");
    if (!window.confirm("Restore this backup? Current data will be replaced after a safety copy is created.")) return;
    const form = new FormData(); form.append("file", file); form.append("current_password", restorePassword);
    try {
      await apiRequest<{ restored: boolean }>("/backup/restore", { method: "POST", body: form });
      window.alert("Backup restored successfully. Please sign in again.");
      window.localStorage.removeItem(TOKEN_KEY); window.localStorage.removeItem(ROLE_KEY); window.localStorage.removeItem("face-monitor-admin-token"); window.location.reload();
    } catch (error) { showToast(error instanceof Error ? error.message : "Backup could not be restored"); }
    finally { if (backupInputRef.current) backupInputRef.current.value = ""; }
  };
  const saveAlerts = async () => {
    try {
      const updated = await apiRequest<AlertSettings>("/settings/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alerts) });
      setAlerts(updated); showToast("Attendance alert settings saved");
    } catch (error) { showToast(error instanceof Error ? error.message : "Alert settings could not be saved"); }
  };
  const testAlerts = async () => {
    try {
      const result = await apiRequest<{ sent: string[]; errors?: string[] }>("/alerts/test", { method: "POST" });
      showToast(result.sent.length ? `Test sent by ${result.sent.join(" & ")}` : result.errors?.[0] || "No alert channel is configured");
    } catch (error) { showToast(error instanceof Error ? error.message : "Test alert could not be sent"); }
  };
  return <>
    <PageHeader title="System Settings" subtitle="Configure recognition and camera preferences" />
    <div className="page-body settings-grid">
      <section className="panel setting-card">
        <span className="eyebrow">Recognition</span><h2>Matching Threshold</h2><p>Higher values require a closer face match and reduce false positives.</p>
        <div className="range-label"><span>{thresholdLabel}</span><strong>{draft.threshold}%</strong></div>
        <input type="range" min="30" max="95" value={draft.threshold} aria-label="Face matching threshold" onChange={(event) => setDraft((current) => ({ ...current, threshold: Number(event.target.value) }))} />
      </section>
      <section className="panel setting-card">
        <span className="eyebrow">Camera</span><h2>Browser Camera</h2><p>These choices apply immediately after you save and open Live Monitoring.</p>
        <label className="switch-row"><span>Mirror preview</span><input type="checkbox" checked={draft.mirrorPreview} onChange={(event) => setDraft((current) => ({ ...current, mirrorPreview: event.target.checked }))} /></label>
        <label className="switch-row"><span>Show scan effect</span><input type="checkbox" checked={draft.scanEffect} onChange={(event) => setDraft((current) => ({ ...current, scanEffect: event.target.checked }))} /></label>
      </section>
      <section className="panel setting-card">
        <span className="eyebrow">Preferences</span><h2>Save on This Device</h2><p>Your recognition and camera preferences remain available after refreshing the website.</p>
        <div className="settings-actions"><button className="primary-button" onClick={() => onSave(draft)}>Save Settings</button><button className="ghost-button" onClick={() => setDraft(DEFAULT_PREFERENCES)}>Reset Defaults</button></div>
      </section>
      <section className="panel setting-card system-info"><span className="eyebrow">Active Configuration</span><h2>Monitoring Setup</h2><p>The values below are sent to the live recognition screen.</p><ul><li>{draft.threshold}% face match threshold</li><li>{draft.mirrorPreview ? "Mirrored" : "Natural"} camera preview</li><li>Scan effect {draft.scanEffect ? "enabled" : "disabled"}</li></ul></section>
      <section className="panel setting-card backup-restore-card"><span className="eyebrow">Data safety</span><h2>Backup & Restore</h2><p>Download students, attendance, settings and face templates. Restore validates the file and creates a safety copy first.</p><div className="settings-actions"><button className="primary-button" onClick={() => void downloadBackup()}>Download Backup</button><button className="ghost-button" onClick={() => backupInputRef.current?.click()}>Restore Backup</button></div><input type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} placeholder="Current password before restore" minLength={12} /><input ref={backupInputRef} type="file" accept=".zip,.db,application/zip,application/vnd.sqlite3" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); }} /></section>
      <section className="panel setting-card retention-card"><span className="eyebrow">Automatic cleanup</span><h2>Captured Image Retention</h2><p>Old evidence photos are removed automatically while attendance logs stay safe.</p><label>Keep photos for<input type="number" min="1" max="365" value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} /> days</label><button className="primary-button" onClick={() => void saveRetention()}>Save & Clean Now</button></section>
      <section className="panel setting-card alerts-card"><span className="eyebrow">Daily notifications</span><h2>Gmail Attendance Alerts</h2><p>Gmail se daily summary mein absent students aur low attendance ki information milegi.</p><label className="switch-row"><span>Enable Gmail alerts</span><input type="checkbox" checked={alerts.enabled} onChange={(event) => setAlerts((value) => ({ ...value, enabled: event.target.checked }))} /></label><label>Low attendance below<input type="number" min="1" max="100" value={alerts.low_percentage} onChange={(event) => setAlerts((value) => ({ ...value, low_percentage: Number(event.target.value) }))} />%</label><input type="email" value={alerts.email_recipient} onChange={(event) => setAlerts((value) => ({ ...value, email_recipient: event.target.value }))} placeholder="Alert receive karne ka email" /><label className="switch-row"><span>Include absent student list</span><input type="checkbox" checked={alerts.send_absent} onChange={(event) => setAlerts((value) => ({ ...value, send_absent: event.target.checked }))} /></label><small>Gmail service: {alerts.email_available ? "connected" : "Gmail App Password needed"}</small><div className="settings-actions"><button className="primary-button" onClick={() => void saveAlerts()}>Save Gmail Alerts</button><button className="ghost-button" onClick={() => void testAlerts()}>Send Test Email</button></div></section>
      <section className="panel setting-card readiness-card"><span className="eyebrow">Field testing</span><h2>Real-world Readiness</h2><p>Live Monitoring now measures light, camera focus and server delay during every anti-spoof check.</p><ul><li>Test one bright and one low-light room</li><li>Test laptop and mobile cameras</li><li>Test once on slow mobile internet</li><li>Confirm a printed photo and replay video are rejected</li></ul><small>Open Live Monitoring to see the live environment and network result.</small></section>
      <section className="panel setting-card security-card"><span className="eyebrow">Signed in as {adminUsername}</span><h2>Change Password</h2><p>Changing your password immediately replaces your current secure session.</p><form className="compact-form" onSubmit={changePassword}><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" minLength={12} required /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New strong password" minLength={12} required /><button className="primary-button" type="submit">Change Password</button></form></section>
      <section className="panel setting-card security-card"><span className="eyebrow">Account recovery</span><h2>Recovery Code</h2><p>Generate and safely store this code. Each code can reset the password once.</p><button className="ghost-button" onClick={() => void rotateRecoveryCode()}>Generate New Code</button>{revealedCode && <div className="recovery-code" role="status"><strong>Save this now</strong><code>{revealedCode}</code><small>It will not be shown again after leaving this page.</small></div>}</section>
      <section className="panel setting-card admin-accounts-card"><span className="eyebrow">Team access</span><h2>Teacher / Admin Accounts</h2><p>Create separate secure logins instead of sharing one password.</p><form className="compact-form admin-create-form" onSubmit={createAdmin}><input value={newAdminUsername} onChange={(event) => setNewAdminUsername(event.target.value)} placeholder="Username" required /><input type="password" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} placeholder="Strong password" minLength={12} required /><button className="primary-button" type="submit">Add Account</button></form><div className="admin-account-list">{admins.map((account) => <div key={account.username}><span><strong>{account.username}</strong><small>{account.recovery_ready ? "Recovery ready" : "Recovery code needed"}</small></span>{account.username !== adminUsername && <button onClick={() => void removeAdmin(account.username)}>Delete</button>}</div>)}</div></section>
      <section className="panel setting-card audit-card"><span className="eyebrow">Admin history</span><h2>Audit Activity</h2><p>Recent high-impact administrative actions.</p><div className="audit-list">{audit.slice(0, 6).map((item) => <div key={item.id}><strong>{item.action.replaceAll("_", " ")}</strong><span>{item.details}</span><small>{formatLogTime(item.created_at, true)}</small></div>)}{!audit.length && <div className="empty-list">No administrative activity yet.</div>}</div></section>
    </div>
  </>;
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
  return <div className="modal-backdrop"><form className="modal" role="dialog" aria-modal="true" aria-labelledby="register-student-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">New Profile</span><h2 id="register-student-title">Register Student</h2></div><button type="button" onClick={onClose} aria-label="Close student registration dialog">×</button></div><label>Student name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter full name" required /></label><label>Roll number<input value={roll} onChange={(event) => setRoll(event.target.value)} placeholder="Enter roll number" required /></label><label>Department<select value={course} onChange={(event) => setCourse(event.target.value)}><option>Computer Science</option><option>Information Technology</option><option>Business Administration</option><option>Other</option></select></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Register Student"}</button></div></form></div>;
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

  return <div className="modal-backdrop"><div className="modal enrollment-modal" role="dialog" aria-modal="true" aria-labelledby="face-enrollment-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}><div className="modal-heading"><div><span className="eyebrow">AI Face Enrollment</span><h2 id="face-enrollment-title">{student.name}</h2></div><button type="button" onClick={onClose} aria-label="Close face enrollment dialog">×</button></div><div className="enrollment-camera"><video ref={videoRef} autoPlay playsInline muted /><div className="face-guide" /></div><p className="enrollment-status">{status}</p><div className="capture-progress"><span style={{ width: `${Math.min(frames.length / 6, 1) * 100}%` }} /></div><div className="enrollment-count">{frames.length} / 6 images</div><div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setFrames([])} disabled={!frames.length || uploading}>Reset</button><button type="button" className="ghost-button" onClick={capture} disabled={uploading || frames.length >= 8}>Capture</button><button type="button" className="primary-button" onClick={upload} disabled={frames.length < 3 || uploading}>{uploading ? "AI Processing..." : "Save Face Profile"}</button></div></div></div>;
}
