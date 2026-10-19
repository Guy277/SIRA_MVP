#!/usr/bin/env python3
"""Page de suivi du serveur de test : écrit /var/lib/sira-status/status.json, lu par infra/status/index.html.

Lancé chaque minute par cron (/etc/cron.d/sira-status, posé par scripts/server/install.sh), en root,
depuis la racine du projet. Python standard seulement. Aucun secret n'est écrit dans le fichier :
il est servi par Caddy sur /statut/ (protégé par mot de passe).
"""
import json
import os
import shutil
import socket
import ssl
import subprocess
import time
import urllib.request
from datetime import datetime, timezone

PROJECT = "sira-mvp"
OUT_DIR = "/var/lib/sira-status"
ENV_FILE = "infra/server.env"
# Dossiers envoyés par npm run server:update : la date du fichier le plus récent = dernière mise à jour.
DEPLOY_PATHS = {
    "api": "services/api",
    "engine": "services/engine",
    "community": "services/community",
    "voice": "services/voice",
    "models": "services/models/voice",
    "data": "data",
    "infra": "infra",
}
SKIPPED_DIRS = {"node_modules", ".venv", "__pycache__", ".pytest_cache", "dist", ".expo"}


def run(*args, timeout=20):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip()[:200])
    return result.stdout


def env_file():
    values = {}
    try:
        with open(ENV_FILE, encoding="utf-8") as handle:
            for line in handle:
                if "=" in line and not line.lstrip().startswith("#"):
                    key, value = line.rstrip("\n").split("=", 1)
                    values[key.strip()] = value.strip().strip("'\"")
    except OSError:
        pass
    return values


def host():
    meminfo = {}
    with open("/proc/meminfo") as handle:
        for line in handle:
            key, value = line.split(":", 1)
            meminfo[key] = int(value.split()[0]) * 1024
    with open("/proc/uptime") as handle:
        uptime = float(handle.read().split()[0])
    disk = shutil.disk_usage("/")
    return {
        "uptime_s": int(uptime),
        "load": list(os.getloadavg()),
        "cpus": os.cpu_count(),
        "mem_total": meminfo["MemTotal"],
        "mem_available": meminfo["MemAvailable"],
        "swap_total": meminfo["SwapTotal"],
        "swap_free": meminfo["SwapFree"],
        "disk_total": disk.total,
        "disk_used": disk.used,
    }


def containers():
    ids = run("docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={PROJECT}").split()
    if not ids:
        return []
    stats = {}
    for line in run("docker", "stats", "--no-stream", "--format", "{{json .}}", *ids, timeout=40).splitlines():
        row = json.loads(line)
        stats[row["ID"][:12]] = row
    items = []
    for info in json.loads(run("docker", "inspect", *ids)):
        state = info["State"]
        stat = stats.get(info["Id"][:12], {})
        items.append({
            "service": info["Config"]["Labels"].get("com.docker.compose.service", info["Name"].lstrip("/")),
            "state": state["Status"],
            "health": (state.get("Health") or {}).get("Status"),
            "started_at": state.get("StartedAt"),
            "restarts": info.get("RestartCount", 0),
            "cpu": stat.get("CPUPerc"),
            "mem": stat.get("MemUsage"),
        })
    return sorted(items, key=lambda item: item["service"])


def http_check(name, url):
    started = time.monotonic()
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            body = response.read(4096).decode("utf-8", "replace")
            return {"name": name, "ok": 200 <= response.status < 300, "code": response.status,
                    "ms": int((time.monotonic() - started) * 1000), "detail": body[:160]}
    except Exception as error:  # noqa: BLE001 - tout échec = service indisponible
        return {"name": name, "ok": False, "code": getattr(error, "code", None),
                "ms": int((time.monotonic() - started) * 1000), "detail": str(error)[:160]}


def certificate(domain):
    try:
        context = ssl.create_default_context()
        with socket.create_connection((domain, 443), timeout=10) as raw:
            with context.wrap_socket(raw, server_hostname=domain) as tls:
                not_after = tls.getpeercert()["notAfter"]
        expires = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        return {"ok": True, "expires_at": expires.isoformat()}
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "detail": str(error)[:160]}


def database():
    container = run("docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}",
                    "--filter", "label=com.docker.compose.service=postgres").strip()
    if not container:
        return {"ok": False, "detail": "conteneur postgres arrêté"}
    tables = ["transport_gtfs_routes", "transport_gtfs_stops", "transport_gtfs_stop_times",
              "community_users", "community_fare_reports", "journey_history"]
    counts = " UNION ALL ".join(
        f"SELECT '{table}', (SELECT count(*) FROM {table}) WHERE to_regclass('{table}') IS NOT NULL"
        for table in tables
    )
    sql = f"SELECT 'size', pg_database_size('sira') UNION ALL {counts}"
    rows = run("docker", "exec", container, "psql", "-U", "sira", "-d", "sira", "-tA", "-F", "\t", "-c", sql)
    values = dict(line.split("\t") for line in rows.splitlines() if "\t" in line)
    return {"ok": True, "size": int(values.pop("size", 0)), "counts": {key: int(value) for key, value in values.items()}}


def deployed():
    result = {}
    for target, path in DEPLOY_PATHS.items():
        newest = 0.0
        for directory, subdirs, files in os.walk(path):
            subdirs[:] = [name for name in subdirs if name not in SKIPPED_DIRS]
            for name in files:
                try:
                    newest = max(newest, os.stat(os.path.join(directory, name)).st_mtime)
                except OSError:
                    pass
        result[target] = datetime.fromtimestamp(newest, timezone.utc).isoformat() if newest else None
    return result


def section(build):
    try:
        return build()
    except Exception as error:  # noqa: BLE001 - une section en panne ne doit pas vider toute la page
        return {"error": str(error)[:200]}


def main():
    env = env_file()
    domain = env.get("SIRA_DOMAIN", "")
    status = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "domain": domain,
        "config": {
            "sira_env": env.get("SIRA_ENV", "production"),
            "sms_configured": bool(env.get("ORANGE_CLIENT_ID")),
            "whisper_model": env.get("VOICE_WHISPER_MODEL", "small"),
        },
        "host": section(host),
        "containers": section(containers),
        "checks": [
            http_check("API (via HTTPS)", f"https://{domain}/api/v1/health"),
            http_check("Arrêts proches (PostGIS)",
                       f"https://{domain}/api/v1/mobility/transport/stops/nearby?lat=5.3364&lon=-4.0267&radiusM=500"),
            http_check("Valhalla (itinéraires)", "http://127.0.0.1:8002/status"),
        ],
        "certificate": certificate(domain) if domain else {"ok": False, "detail": "SIRA_DOMAIN vide"},
        "database": section(database),
        "deployed": section(deployed),
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    temporary = os.path.join(OUT_DIR, "status.json.tmp")
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(status, handle, ensure_ascii=False)
    os.chmod(temporary, 0o644)
    os.replace(temporary, os.path.join(OUT_DIR, "status.json"))


if __name__ == "__main__":
    main()
