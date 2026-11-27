import base64
import fcntl
import gzip
import hashlib
import json
import os
import shlex
import shutil
import stat
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import urllib.error


APP = "/www/wwwroot/room-booking-upgrade-20261013"
BACKUP_ROOT = "/www/backup/room-booking-codex-20261013"
NAME = "room-booking-upgrade-20261013"
ALLOWED = (
    "server.js", "lib/config.js", "lib/storage.js", "lib/auth.js", "lib/import-talents.js",
    "public/app.js", "public/styles.css", "public/index.html",
    "public/usability.css", "public/talent-picker.js", "public/talent-picker.css",
    "scripts/import-talents.js",
)
MAY_CREATE = frozenset((
    "lib/import-talents.js",
    "public/usability.css", "public/talent-picker.js", "public/talent-picker.css",
    "scripts/import-talents.js",
))
PAYLOAD_FILE = "__PAYLOAD_FILE__"
PAYLOAD_SHA256 = "__PAYLOAD_SHA256__"
RELEASE_ID = "__RELEASE_ID__"
BASELINE_FROM = "__BASELINE_FROM__"
BASELINE_TO = "__BASELINE_TO__"
BASE = "http://127.0.0.1:3000"
API_COOKIE = None


def emit(label, value):
    print(label, json.dumps(value, ensure_ascii=True, sort_keys=True), flush=True)


def digest(content):
    return hashlib.sha256(content).hexdigest()


def read_bytes(filename):
    with open(filename, "rb") as handle:
        return handle.read()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def code_destination(relative, create_parent=False):
    require(relative in ALLOWED, "Code destination is not in the release whitelist")
    target = APP + "/" + relative
    parent = os.path.dirname(target)
    if relative == "scripts/import-talents.js" and not os.path.lexists(parent):
        require(parent == APP + "/scripts", "Unexpected optional code directory")
        require(os.path.realpath(APP) == APP, "Application path is not canonical")
        if create_parent:
            os.mkdir(parent, 0o755)
        else:
            return target
    require(
        os.path.isdir(parent) and os.path.realpath(parent) == parent,
        "Code destination parent differs from the expected path",
    )
    if os.path.lexists(target):
        require(
            stat.S_ISREG(os.lstat(target).st_mode)
            and os.path.realpath(target) == target,
            "Code destination differs from the expected path",
        )
    else:
        require(relative in MAY_CREATE, "Required code destination is missing")
    return target


def code_state(relative):
    target = code_destination(relative)
    if not os.path.lexists(target):
        return {"exists": False, "content": None, "mode": 0o644}
    return {
        "exists": True,
        "content": read_bytes(target),
        "mode": stat.S_IMODE(os.stat(target).st_mode),
    }


def describe_code(originals):
    return {
        relative: {
            "exists": item["exists"],
            "mode": item["mode"],
            "sha256": digest(item["content"]) if item["exists"] else None,
        }
        for relative, item in originals.items()
    }


def restore_code(originals):
    require(set(originals) == set(ALLOWED), "Original code snapshot is incomplete")
    for relative in ALLOWED:
        target = code_destination(relative)
        item = originals[relative]
        if item["exists"]:
            write_atomic(target, item["content"], item["mode"])
        elif os.path.lexists(target):
            # Only the explicitly allowed new code files can reach this path.
            # Remove this release's file, restoring its original absent state.
            require(relative in MAY_CREATE, "Cannot remove a required code file")
            os.unlink(target)
    for relative in ALLOWED:
        actual = code_state(relative)
        expected = originals[relative]
        require(
            actual["exists"] == expected["exists"]
            and actual["content"] == expected["content"]
            and (not actual["exists"] or actual["mode"] == expected["mode"]),
            "Restored code differs from the original snapshot: " + relative,
        )


def pm2(args):
    result = subprocess.run(
        ["bash", "-lc", "pm2 " + shlex.join(args)],
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=20,
    )
    if result.returncode:
        raise RuntimeError("PM2 command failed: " + args[0])
    return result.stdout


def target_process():
    matches = [app for app in json.loads(pm2(["jlist"])) if app["name"] == NAME]
    require(len(matches) == 1, "Expected exactly one upgrade process")
    app = matches[0]
    environment = app["pm2_env"]
    require(
        os.path.realpath(environment["pm_exec_path"]) == APP + "/server.js",
        "PM2 script differs from the expected application",
    )
    require(
        os.path.realpath(environment["pm_cwd"]) == APP,
        "PM2 working directory differs from the expected application",
    )
    require(
        environment["exec_mode"] == "fork_mode"
        and int(environment.get("instances", 1)) == 1,
        "Expected one fork instance",
    )
    return app


def get_json(route):
    global API_COOKIE
    headers = {"Cookie": API_COOKIE} if API_COOKIE else {}
    request = urllib.request.Request(BASE + route, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        code = os.environ.get("ROOM_RELEASE_VIEW_CODE")
        if error.code != 401 or API_COOKIE or not code:
            raise
        login = urllib.request.Request(
            BASE + "/api/company-login",
            data=json.dumps({"name": "Deployment verification", "password": code}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(login, timeout=5) as response:
            require(response.status == 200, "Company access verification failed")
            API_COOKIE = response.headers["Set-Cookie"].split(";")[0]
        with urllib.request.urlopen(
            urllib.request.Request(BASE + route, headers={"Cookie": API_COOKIE}), timeout=3
        ) as response:
            return json.load(response)


def api_counts():
    suffix = "?from=" + BASELINE_FROM + "&to=" + BASELINE_TO
    require(get_json("/api/health").get("ok") is True, "Health check failed")
    config = get_json("/api/config")
    return {
        "healthy": True,
        "rooms": len(config["rooms"]),
        "bookings": len(get_json("/api/bookings" + suffix)["bookings"]),
        "talents": len(get_json("/api/talents")["talents"]),
        "schedules": len(get_json("/api/schedules" + suffix)["schedules"]),
        "from": BASELINE_FROM,
        "to": BASELINE_TO,
    }


def wait_healthy():
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            if get_json("/api/health").get("ok") is True:
                return
        except Exception:
            pass
        time.sleep(0.15)
    raise RuntimeError("Application did not become healthy")


def fingerprint_data(directory):
    result = {}
    for current, directories, files in os.walk(directory, followlinks=False):
        for name in directories:
            require(
                not os.path.islink(os.path.join(current, name)),
                "Data directory contains a symbolic link",
            )
        for name in files:
            filename = os.path.join(current, name)
            require(
                not os.path.islink(filename),
                "Data file is a symbolic link",
            )
            relative = os.path.relpath(filename, directory).replace(os.sep, "/")
            # Audit records are expected to append during verification. The
            # access policy and every business/admin file remain fingerprinted.
            if relative in {"security/audit.jsonl"} | {
                "security/audit.jsonl." + str(index) for index in range(1, 5)
            }:
                continue
            content = read_bytes(filename)
            result[relative] = {"bytes": len(content), "sha256": digest(content)}
    return dict(sorted(result.items()))


def save_json(filename, value):
    with open(filename, "x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=True, sort_keys=True, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(filename, 0o600)


def write_atomic(filename, content, mode):
    descriptor, temporary = tempfile.mkstemp(
        prefix="." + os.path.basename(filename) + ".release-",
        dir=os.path.dirname(filename),
    )
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, filename)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def storage_counts(node, code_root, data_dir, room_file):
    code = """
const path = require('node:path');
const storage = require(path.join(process.argv[1], 'lib/storage.js'));
const config = require(path.join(process.argv[1], 'lib/config.js'));
const rooms = storage.loadRooms(process.argv[3]).bookings;
const sellers = storage.loadSellers(path.join(process.argv[2], 'sellers.json'));
const from = process.argv[4], to = process.argv[5];
console.log(JSON.stringify({
  roomRecords: rooms.length,
  roomDates: new Set(rooms.map(item => item.date)).size,
  rooms: new Set([...config.rooms, ...rooms.map(item => item.room)]).size,
  talents: sellers.talents.length,
  schedules: sellers.schedules.length,
  bookingsInRange: rooms.filter(item => item.date >= from && item.date <= to).length,
  schedulesInRange: sellers.schedules.filter(item => item.date >= from && item.date <= to).length
}));
"""
    result = subprocess.run(
        [node, "-e", code, code_root, data_dir, room_file, BASELINE_FROM, BASELINE_TO],
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=15,
    )
    require(result.returncode == 0, "Existing data cannot be read by the release")
    return json.loads(result.stdout)


def assert_api_counts(actual, expected):
    require(
        actual["rooms"] == expected["rooms"]
        and actual["bookings"] == expected["bookingsInRange"]
        and actual["talents"] == expected["talents"]
        and actual["schedules"] == expected["schedulesInRange"],
        "Public API counts differ from the stopped data snapshot",
    )


def main():
    phase = "precheck"
    stopped = False
    changed = False
    backup = None
    originals = {}
    frozen_hashes = None
    stage = None
    node = None
    data_dir = None
    room_file = None
    lock = None
    try:
        require(os.path.realpath(APP) == APP, "Application path is not canonical")
        require(
            os.path.isdir(BACKUP_ROOT) and os.path.realpath(BACKUP_ROOT) == BACKUP_ROOT,
            "Expected private backup directory is unavailable",
        )
        lock = open(BACKUP_ROOT + "/release-update.lock", "a")
        os.chmod(BACKUP_ROOT + "/release-update.lock", 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        compressed = read_bytes(PAYLOAD_FILE)
        require(digest(compressed) == PAYLOAD_SHA256, "Payload checksum mismatch")
        manifest = json.loads(gzip.decompress(compressed))
        require(
            isinstance(manifest, dict)
            and manifest.get("version") == 1
            and set(manifest.keys()) == {"version", "files"},
            "Unexpected payload structure",
        )
        require(
            isinstance(manifest["files"], dict)
            and set(manifest["files"].keys()) == set(ALLOWED),
            "Payload must contain exactly " + str(len(ALLOWED)) + " allowed code files",
        )
        files = {}
        for relative in ALLOWED:
            item = manifest["files"][relative]
            require(
                isinstance(item, dict)
                and set(item.keys()) == {"bytes", "sha256", "base64"},
                "Unexpected code file manifest",
            )
            content = base64.b64decode(item["base64"], validate=True)
            require(
                len(content) == item["bytes"] and digest(content) == item["sha256"],
                "Code file checksum mismatch: " + relative,
            )
            content.decode("utf-8")
            code_destination(relative)
            files[relative] = content
        process = target_process()
        require(process["pm2_env"]["status"] == "online", "Application is not online")
        node = os.readlink("/proc/" + str(process["pid"]) + "/exe")
        environment = process["pm2_env"]
        data_dir = os.path.realpath(environment.get("DATA_DIR") or APP + "/data")
        room_file = os.path.realpath(
            environment.get("BOOKINGS_FILE") or APP + "/bookings.json"
        )
        require(data_dir == APP + "/data", "Unexpected production data directory")
        require(
            room_file == data_dir + "/bookings.json",
            "Unexpected room booking data path",
        )
        require(os.path.isdir(data_dir), "Production data directory is missing")
        require(int(environment.get("PORT", 3000)) == 3000, "Unexpected production port")
        before_api = api_counts()
        emit(
            "RELEASE_PRECHECK",
            {
                "app": APP,
                "pm2": NAME,
                "pm2Id": process["pm_id"],
                "apiBefore": before_api,
                "payloadSha256": PAYLOAD_SHA256,
                "codeFiles": list(ALLOWED),
            },
        )

        phase = "stage"
        stage = tempfile.mkdtemp(prefix="room-booking-release-")
        shutil.copytree(APP + "/lib", stage + "/lib")
        for relative in ("server.js", "package.json"):
            shutil.copy2(APP + "/" + relative, stage + "/" + relative)
        os.makedirs(stage + "/public")
        for relative, content in files.items():
            os.makedirs(os.path.dirname(stage + "/" + relative), exist_ok=True)
            with open(stage + "/" + relative, "wb") as handle:
                handle.write(content)
        for relative in ALLOWED:
            if relative.endswith(".js"):
                syntax = subprocess.run(
                    [node, "--check", stage + "/" + relative],
                    text=True,
                    encoding="utf-8",
                    capture_output=True,
                    timeout=10,
                )
                require(syntax.returncode == 0, "Staged JavaScript syntax is invalid")
        storage_counts(node, stage, data_dir, room_file)

        phase = "stop"
        stopped = True
        pm2(["stop", NAME])
        require(target_process()["pm2_env"]["status"] == "stopped", "PM2 did not stop")
        frozen_hashes = fingerprint_data(data_dir)
        frozen_counts = storage_counts(node, stage, data_dir, room_file)

        phase = "backup"
        backup = BACKUP_ROOT + "/release-" + RELEASE_ID
        os.mkdir(backup, 0o700)
        for relative in ALLOWED:
            target = code_destination(relative)
            original = code_state(relative)
            originals[relative] = original
            if original["exists"]:
                destination = backup + "/code/" + relative
                os.makedirs(os.path.dirname(destination), mode=0o700, exist_ok=True)
                shutil.copy2(target, destination)
                require(
                    read_bytes(destination) == original["content"],
                    "Code backup differs from original: " + relative,
                )
        archive = backup + "/data-before.tar.gz"
        with tarfile.open(archive, "w:gz", dereference=False) as handle:
            handle.add(data_dir, arcname="data")
        os.chmod(archive, 0o600)
        require(fingerprint_data(data_dir) == frozen_hashes, "Data changed while stopped")
        save_json(
            backup + "/state-before.json",
            {
                "releaseId": RELEASE_ID,
                "app": APP,
                "pm2": NAME,
                "pm2Id": process["pm_id"],
                "payloadSha256": PAYLOAD_SHA256,
                "apiBefore": before_api,
                "countsStopped": frozen_counts,
                "dataFiles": frozen_hashes,
                "codeBefore": describe_code(originals),
            },
        )

        phase = "replace"
        changed = True
        for relative in ALLOWED:
            write_atomic(
                code_destination(relative, create_parent=True),
                files[relative],
                originals[relative]["mode"],
            )
        require(
            all(
                digest(read_bytes(APP + "/" + relative))
                == manifest["files"][relative]["sha256"]
                for relative in ALLOWED
            ),
            "Installed code checksum mismatch",
        )
        require(
            fingerprint_data(data_dir) == frozen_hashes,
            "Data changed during code replacement",
        )

        phase = "restart"
        pm2(["restart", NAME])
        wait_healthy()
        require(target_process()["pm2_env"]["status"] == "online", "PM2 is not online")
        after_api = api_counts()
        after_counts = storage_counts(node, APP, data_dir, room_file)
        require(
            fingerprint_data(data_dir) == frozen_hashes,
            "Data snapshot changed during release verification",
        )
        require(after_counts == frozen_counts, "Storage counts changed during release")
        assert_api_counts(after_api, frozen_counts)
        pm2(["save"])
        result = {
            "releaseId": RELEASE_ID,
            "app": APP,
            "pm2": NAME,
            "backupDir": backup,
            "healthy": True,
            "dataUnchanged": True,
            "dataFiles": len(frozen_hashes),
            "counts": after_counts,
            "apiAfter": after_api,
            "codeSha256": {
                relative: manifest["files"][relative]["sha256"] for relative in ALLOWED
            },
        }
        save_json(backup + "/release-success.json", result)
        emit("RELEASE_OK", result)
        return 0
    except Exception as error:
        emit(
            "RELEASE_ERROR",
            {"phase": phase, "errorClass": type(error).__name__, "reason": str(error)[:200]},
        )
        if stopped:
            try:
                if changed:
                    pm2(["stop", NAME])
                    # The new process may have accepted a legitimate booking or
                    # a new-schema schedule before verification completed.
                    # Never restore older code against such live data, and
                    # never replace it with the frozen backup.
                    current_hashes = fingerprint_data(data_dir)
                    if current_hashes != frozen_hashes:
                        require(
                            all(
                                digest(read_bytes(APP + "/" + relative))
                                == manifest["files"][relative]["sha256"]
                                for relative in ALLOWED
                            ),
                            "Live data changed and installed code is incomplete; automatic rollback is unsafe",
                        )
                        pm2(["restart", NAME])
                        wait_healthy()
                        require(
                            target_process()["pm2_env"]["status"] == "online",
                            "New process is not online after preserving changed live data",
                        )
                        pm2(["save"])
                        current_counts = storage_counts(node, APP, data_dir, room_file)
                        review = {
                            "releaseId": RELEASE_ID,
                            "healthy": True,
                            "codeRestored": False,
                            "dataRestored": False,
                            "dataMatchesStoppedSnapshot": False,
                            "automaticRollbackSkipped": True,
                            "reviewRequired": True,
                            "reason": "Live data changed after the release snapshot; kept the new code and all live data",
                            "dataFiles": len(current_hashes),
                            "counts": current_counts,
                            "backupDir": backup,
                        }
                        if backup:
                            save_json(backup + "/release-review-required.json", review)
                        emit("ROLLBACK_SKIPPED_DATA_CHANGED", review)
                        emit("RELEASE_REQUIRES_REVIEW", review)
                        return 1
                    restore_code(originals)
                pm2(["restart", NAME])
                wait_healthy()
                require(
                    target_process()["pm2_env"]["status"] == "online",
                    "Rollback process is not online",
                )
                pm2(["save"])
                current_hashes = fingerprint_data(data_dir)
                current_counts = storage_counts(node, APP, data_dir, room_file)
                rollback = {
                    "healthy": True,
                    "codeRestored": changed,
                    "dataRestored": False,
                    "dataMatchesStoppedSnapshot": current_hashes == frozen_hashes,
                    "dataFiles": len(current_hashes),
                    "counts": current_counts,
                    "backupDir": backup,
                }
                if backup:
                    save_json(backup + "/rollback-result.json", rollback)
                emit("ROLLBACK_OK", rollback)
            except Exception as rollback_error:
                emit(
                    "ROLLBACK_ERROR",
                    {
                        "errorClass": type(rollback_error).__name__,
                        "reason": str(rollback_error)[:200],
                        "backupDir": backup,
                        "dataRestored": False,
                    },
                )
        return 1
    finally:
        if lock is not None:
            lock.close()


if __name__ == "__main__":
    raise SystemExit(main())
