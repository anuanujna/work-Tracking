from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import secrets
import shutil
import sqlite3
import ssl
import threading
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).parent.resolve()
DATABASE = ROOT / "worktrack.db"
OLD_DATA = ROOT / "reports.json"
LOCK = threading.Lock()
SESSIONS: dict[str, tuple[str, datetime]] = {}
SESSION_DAYS = 1


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{salt.hex()}${digest.hex()}"


def password_matches(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 310_000).hex()
        return secrets.compare_digest(actual, digest_hex)
    except (ValueError, TypeError):
        return False


def connection() -> sqlite3.Connection:
    database = sqlite3.connect(DATABASE)
    database.row_factory = sqlite3.Row
    return database


def initialize_database() -> None:
    with connection() as database:
        database.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'manager',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                viewed_at TEXT NOT NULL,
                row_count INTEGER NOT NULL,
                rows_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                action TEXT NOT NULL,
                report_id TEXT,
                details TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        """)
        admin_user = os.getenv("WORKTRACK_ADMIN_USER", "admin")
        admin_password = os.getenv("WORKTRACK_ADMIN_PASSWORD", "change-me-now")
        database.execute("INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?)", (admin_user, password_hash(admin_password), "admin", now()))
        if not database.execute("SELECT 1 FROM reports LIMIT 1").fetchone() and OLD_DATA.exists():
            try:
                old_reports = json.loads(OLD_DATA.read_text(encoding="utf-8"))
                for report in old_reports if isinstance(old_reports, list) else []:
                    database.execute("INSERT OR IGNORE INTO reports VALUES (?, ?, ?, ?, ?)", (report.get("id", str(uuid.uuid4())), report.get("name", "Imported report"), report.get("viewedAt", now()), report.get("rowCount", len(report.get("rows", []))), json.dumps(report.get("rows", []))))
            except (OSError, json.JSONDecodeError):
                pass


def audit(username: str, action: str, details: str, report_id: str | None = None) -> None:
    with connection() as database:
        database.execute("INSERT INTO audit_log(username, action, report_id, details, created_at) VALUES (?, ?, ?, ?, ?)", (username, action, report_id, details, now()))


class WorkTrackHandler(BaseHTTPRequestHandler):
    server_version = "WorkTrack/2.0"

    def send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK, headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def payload(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        value = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("payload must be an object")
        return value

    def current_user(self) -> tuple[str, str] | None:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        token = cookie.get("worktrack_session")
        if not token or token.value not in SESSIONS:
            return None
        username, expires = SESSIONS[token.value]
        if expires <= datetime.now(timezone.utc):
            SESSIONS.pop(token.value, None)
            return None
        with connection() as database:
            user = database.execute("SELECT username, role FROM users WHERE username = ?", (username,)).fetchone()
        return (user["username"], user["role"]) if user else None

    def require_user(self) -> tuple[str, str] | None:
        user = self.current_user()
        if not user:
            self.send_json({"error": "Login required"}, HTTPStatus.UNAUTHORIZED)
        return user

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            self.send_json({"ok": True, "service": "worktrack-api", "database": "sqlite"})
            return
        if path == "/api/session":
            user = self.current_user()
            self.send_json({"authenticated": bool(user), "user": {"username": user[0], "role": user[1]} if user else None})
            return
        if path == "/api/config":
            self.send_json({"companyLoginUrl": os.getenv("WORKTRACK_COMPANY_LOGIN_URL", "")})
            return
        if not path.startswith("/api/"):
            self.serve_static(path)
            return
        user = self.require_user()
        if not user:
            return
        if path == "/api/reports":
            with connection() as database:
                reports = [dict(row) | {"rows": json.loads(row["rows_json"])} for row in database.execute("SELECT id, name, viewed_at AS viewedAt, row_count AS rowCount, rows_json FROM reports ORDER BY viewed_at DESC LIMIT 10")]
            for report in reports:
                report.pop("rows_json", None)
            self.send_json(reports)
            return
        if path.startswith("/api/reports/"):
            report_id = path.rsplit("/", 1)[-1]
            with connection() as database:
                row = database.execute("SELECT id, name, viewed_at AS viewedAt, row_count AS rowCount, rows_json FROM reports WHERE id = ?", (report_id,)).fetchone()
            report = dict(row) if row else None
            if report:
                report["rows"] = json.loads(report.pop("rows_json"))
            self.send_json(report or {"error": "Report not found"}, HTTPStatus.OK if report else HTTPStatus.NOT_FOUND)
            return
        if path == "/api/audit":
            with connection() as database:
                logs = [dict(row) for row in database.execute("SELECT username, action, report_id AS reportId, details, created_at AS createdAt FROM audit_log ORDER BY id DESC LIMIT 100")]
            self.send_json(logs)
            return
        self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path in ("/api/logout", "/api/backup") and int(self.headers.get("Content-Length", "0")) == 0:
            data = {}
        else:
            try:
                data = self.payload()
            except (ValueError, json.JSONDecodeError):
                self.send_json({"error": "Invalid JSON payload"}, HTTPStatus.BAD_REQUEST)
                return
        if path == "/api/login":
            username, password = str(data.get("username", "")), str(data.get("password", ""))
            with connection() as database:
                user = database.execute("SELECT username, password_hash, role FROM users WHERE username = ?", (username,)).fetchone()
            if not user or not password_matches(password, user["password_hash"]):
                self.send_json({"error": "Invalid username or password"}, HTTPStatus.UNAUTHORIZED)
                return
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = (user["username"], datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS))
            audit(username, "login", "Successful login")
            self.send_json({"authenticated": True, "user": {"username": username, "role": user["role"]}}, headers={"Set-Cookie": f"worktrack_session={token}; HttpOnly; SameSite=Lax; Path=/"})
            return
        if path == "/api/logout":
            user = self.current_user()
            if user:
                audit(user[0], "logout", "Session ended")
            self.send_json({"authenticated": False}, headers={"Set-Cookie": "worktrack_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/"})
            return
        if path == "/api/change-password":
            authenticated_user = self.current_user()
            username = authenticated_user[0] if authenticated_user else str(data.get("username", "")).strip()
            current_password = str(data.get("currentPassword", ""))
            new_password = str(data.get("newPassword", ""))
            if not username:
                self.send_json({"error": "Username is required"}, HTTPStatus.BAD_REQUEST)
                return
            if len(new_password) < 8:
                self.send_json({"error": "New password must be at least 8 characters"}, HTTPStatus.BAD_REQUEST)
                return
            if current_password == new_password:
                self.send_json({"error": "New password must be different from the current password"}, HTTPStatus.BAD_REQUEST)
                return
            with connection() as database:
                account = database.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
                if not account or not password_matches(current_password, account["password_hash"]):
                    self.send_json({"error": "Current password is incorrect"}, HTTPStatus.UNAUTHORIZED)
                    return
                database.execute("UPDATE users SET password_hash = ? WHERE username = ?", (password_hash(new_password), username))
            audit(username, "password_changed", "Password changed successfully")
            self.send_json({"ok": True})
            return
        user = self.require_user()
        if not user:
            return
        if path == "/api/reports":
            name = str(data.get("name", "Untitled report"))[:200]
            rows = data.get("rows", [])
            if not isinstance(rows, list):
                self.send_json({"error": "rows must be a list"}, HTTPStatus.BAD_REQUEST)
                return
            report = {"id": str(uuid.uuid4()), "name": name, "viewedAt": now(), "rowCount": len(rows), "rows": rows}
            with connection() as database:
                database.execute("DELETE FROM reports WHERE name = ?", (name,))
                database.execute("INSERT INTO reports VALUES (?, ?, ?, ?, ?)", (report["id"], name, report["viewedAt"], len(rows), json.dumps(rows, ensure_ascii=False)))
                database.execute("DELETE FROM reports WHERE id NOT IN (SELECT id FROM reports ORDER BY viewed_at DESC LIMIT 10)")
            audit(user[0], "report_saved", f"Saved {name} with {len(rows)} rows", report["id"])
            self.send_json(report, HTTPStatus.CREATED)
            return
        if path == "/api/backup":
            if user[1] != "admin":
                self.send_json({"error": "Admin access required"}, HTTPStatus.FORBIDDEN)
                return
            backup = ROOT / "backups" / f"worktrack-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
            backup.parent.mkdir(exist_ok=True)
            with LOCK:
                shutil.copy2(DATABASE, backup)
            audit(user[0], "backup_created", backup.name)
            self.send_json({"ok": True, "backup": backup.name}, HTTPStatus.CREATED)
            return
        self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def serve_static(self, path: str) -> None:
        relative = "index.html" if path in ("", "/") else path.lstrip("/")
        requested = (ROOT / relative).resolve()
        if ROOT not in requested.parents and requested != ROOT or not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content = requested.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mimetypes.guess_type(str(requested))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    initialize_database()
    port = int(os.getenv("WORKTRACK_PORT", "8000"))
    host = os.getenv("WORKTRACK_HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), WorkTrackHandler)
    cert, key = os.getenv("WORKTRACK_CERT"), os.getenv("WORKTRACK_KEY")
    scheme = "http"
    if cert and key:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        scheme = "https"
    print(f"WorkTrack running at {scheme}://localhost:{port}")
    server.serve_forever()
