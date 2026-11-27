"""Exercise the actual release template with isolated files and fake PM2/HTTP."""

import base64
import contextlib
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = (ROOT / "scripts/remote-release-template.py").read_text(encoding="utf-8")
ALLOWED = (
    "server.js", "lib/config.js", "lib/storage.js", "lib/auth.js", "lib/import-talents.js",
    "public/app.js", "public/styles.css", "public/index.html",
    "public/usability.css", "public/talent-picker.js", "public/talent-picker.css",
    "scripts/import-talents.js",
)
NEW_ASSETS = frozenset((
    "lib/import-talents.js",
    "public/usability.css", "public/talent-picker.js", "public/talent-picker.css",
    "scripts/import-talents.js",
))
NODE = shutil.which("node")
if not NODE:
    raise RuntimeError("Node.js is required")
if sys.platform == "win32":
    fake_fcntl = types.ModuleType("fcntl")
    fake_fcntl.LOCK_EX = 1
    fake_fcntl.LOCK_NB = 2
    fake_fcntl.flock = lambda *arguments: None
    sys.modules.setdefault("fcntl", fake_fcntl)
OUTPUT = ROOT / "tmp" / "release-workflow-validation"
OUTPUT.mkdir(exist_ok=True)
ROOM_COUNT = json.loads(subprocess.check_output(
    [NODE, "-p", "JSON.stringify(require('./lib/config').rooms.length)"],
    cwd=ROOT, text=True,
))
BASE_DEPARTMENTS = json.loads(subprocess.check_output(
    [NODE, "-p", "JSON.stringify(require('./lib/config').departments)"],
    cwd=ROOT, text=True, encoding="utf-8",
))
REPORTS = []


def sha(content):
    return hashlib.sha256(content).hexdigest()


def run_case(label, failure=None, new_assets_absent=True):
    fixture = Path(tempfile.mkdtemp(prefix=label + "-", dir=OUTPUT))
    app = fixture / "app"
    backup = fixture / "backup"
    backup.mkdir()
    data = app / "data"
    data.mkdir(parents=True)
    shutil.copytree(ROOT / "lib", app / "lib")
    (app / "public").mkdir()
    shutil.copy2(ROOT / "package.json", app / "package.json")
    originals = {}
    files = {}
    for relative in ALLOWED:
        content = (ROOT / relative).read_bytes()
        originals[relative] = None
        if not (new_assets_absent and relative in NEW_ASSETS):
            prefix = (b"<!-- previous isolated HTML -->\n" if relative.endswith(".html")
                      else b"/* previous isolated code */\n")
            old = prefix + content
            if failure in ("live-three-seller-write", "live-write-before-rollback") and relative == "lib/config.js":
                # Reproduce the real old version's two-person storage limit.
                assert b"const maxTalentsPerSchedule = 3;" in old
                old = old.replace(b"const maxTalentsPerSchedule = 3;", b"const maxTalentsPerSchedule = 2;")
            (app / relative).parent.mkdir(parents=True, exist_ok=True)
            (app / relative).write_bytes(old)
            os.chmod(app / relative, 0o644)
            originals[relative] = old
        elif (app / relative).exists():
            # lib/ was copied before constructing the original code snapshot.
            # Reproduce the actual production absence of the optional module.
            (app / relative).unlink()
        files[relative] = {
            "bytes": len(content),
            "sha256": sha(content),
            "base64": base64.b64encode(content).decode("ascii"),
        }
    (data / "admins.json").write_bytes(b'{"fixture":"keep admin hashes"}\n')
    (data / "bookings.json").write_text(json.dumps({
        "version": 2,
        "bookings": [{
            "id": "room-fixture", "date": "2026-10-20", "room": "Room-test",
            "slot": "morning", "department": "Fixture-team",
            "bookerName": "Fixture-person",
        }],
    }), encoding="utf-8")
    (data / "sellers.json").write_text(json.dumps({
        "version": 1,
        "talents": [{
            "id": "person-fixture", "number": "0001", "name": "Fixture-person",
            "active": True, "avatar": "",
        }],
        "schedules": [{
            "id": "schedule-fixture", "date": "2026-10-20", "business": "FB",
            "department": "d1", "group": "\u4e00\u7ec4", "slot": "morning",
            "batchId": "batch-fixture", "talentId": "person-fixture",
        }],
    }), encoding="utf-8")
    (data / "talent-stories.json").write_bytes(b'{"version":1,"stories":[]}\n')
    if failure == "missing-asset":
        files.pop("public/talent-picker.js")
    if failure == "extra-data":
        files["data/admins.json"] = {
            "bytes": 2, "sha256": sha(b"{}"), "base64": "e30=",
        }
    if failure == "path-traversal":
        files["public/../data/admins.json"] = {
            "bytes": 2, "sha256": sha(b"{}"), "base64": "e30=",
        }
    if failure == "directory-target":
        (app / "public/usability.css").mkdir()
    if failure == "required-missing":
        (app / "public/index.html").unlink()
        originals["public/index.html"] = None
    if failure == "scripts-parent-file":
        (app / "scripts").write_bytes(b"Existing unrelated file must be preserved")
    payload = gzip.compress(json.dumps({"version": 1, "files": files}).encode())
    payload_file = fixture / "payload.json.gz"
    payload_file.write_bytes(payload)
    namespace = {"__name__": "isolated_release_verification"}
    exec(compile(TEMPLATE, "<remote-release-template>", "exec"), namespace)
    assert tuple(namespace["ALLOWED"]) == ALLOWED
    assert namespace["MAY_CREATE"] == NEW_ASSETS
    app_name = str(app).replace("\\", "/")
    backup_name = str(backup).replace("\\", "/")
    namespace.update(
        APP=app_name, BACKUP_ROOT=backup_name, PAYLOAD_FILE=str(payload_file),
        PAYLOAD_SHA256=sha(payload), RELEASE_ID=label,
        BASELINE_FROM="2026-08-01", BASELINE_TO="2026-10-31",
    )
    path_proxy = types.SimpleNamespace(**{
        name: getattr(os.path, name)
        for name in dir(os.path) if not name.startswith("__")
    })
    path_proxy.realpath = lambda filename: os.path.realpath(filename).replace("\\", "/")
    os_proxy = types.SimpleNamespace(**{
        name: getattr(os, name) for name in dir(os) if not name.startswith("__")
    })
    os_proxy.path = path_proxy
    os_proxy.readlink = lambda filename: NODE
    namespace["os"] = os_proxy
    state = {
        "status": "online", "actions": [], "failureTriggered": False,
        "partialCreated": False, "liveWriteBytes": None, "restarts": 0,
        "liveConfigBytes": None,
    }

    def write_three_seller_schedule():
        assert state["liveWriteBytes"] is None
        sellers = json.loads((data / "sellers.json").read_text(encoding="utf-8"))
        for number in (2, 3):
            sellers["talents"].append({
                "id": "person-fixture-" + str(number),
                "number": str(number).zfill(4),
                "name": "Live-person-" + str(number),
                "active": True, "avatar": "",
            })
        sellers["schedules"][0]["talentIds"] = [person["id"] for person in sellers["talents"]]
        content = (json.dumps(sellers) + "\n").encode("utf-8")
        (data / "sellers.json").write_bytes(content)
        state["liveWriteBytes"] = content

    def write_department_configuration():
        departments = json.loads(json.dumps(BASE_DEPARTMENTS))
        departments.append({
            "id": "d-fixture000006", "name": "New live department",
            "groups": ["First group"], "slots": ["morning"],
            "archivedGroups": [],
        })
        content = (json.dumps({
            "version": 2, "departments": departments, "archivedDepartments": [],
        }) + "\n").encode("utf-8")
        (data / "schedule-config.json").write_bytes(content)
        state["liveConfigBytes"] = content

    def pm2(arguments):
        if arguments[0] == "jlist":
            return json.dumps([{
                "name": namespace["NAME"], "pm_id": 1, "pid": 123,
                "pm2_env": {
                    "pm_exec_path": app_name + "/server.js", "pm_cwd": app_name,
                    "exec_mode": "fork_mode", "instances": 1,
                    "status": state["status"], "DATA_DIR": app_name + "/data",
                    "BOOKINGS_FILE": app_name + "/data/bookings.json", "PORT": "3000",
                },
            }])
        state["actions"].append(arguments[0])
        if arguments[0] == "stop":
            state["status"] = "stopped"
            if failure == "live-write-before-rollback" and state["restarts"] == 1:
                write_three_seller_schedule()
        if arguments[0] == "restart":
            if failure == "restart" and not state["failureTriggered"]:
                assert all((app / relative).is_file() for relative in NEW_ASSETS)
                state["failureTriggered"] = True
                raise RuntimeError("Injected restart failure")
            state["status"] = "online"
            state["restarts"] += 1
            if failure == "live-three-seller-write" and state["restarts"] == 1:
                write_three_seller_schedule()
            if failure == "live-department-config-write" and state["restarts"] == 1:
                write_department_configuration()
        return ""

    def get_json(route):
        if route == "/api/health":
            return {"ok": state["status"] == "online"}
        if route == "/api/config":
            if failure == "live-write-before-rollback" and state["restarts"] == 1:
                raise RuntimeError("Injected verification failure before a final live write")
            return {"rooms": list(range(ROOM_COUNT + 1))}
        if route.startswith("/api/bookings"):
            return {"bookings": [1]}
        if route.startswith("/api/talents"):
            return {"talents": [1, 2, 3] if state["liveWriteBytes"] else [1]}
        if route.startswith("/api/schedules"):
            return {"schedules": [1]}
        raise RuntimeError("Unexpected API query")

    namespace["pm2"] = pm2
    namespace["get_json"] = get_json
    before_data = namespace["fingerprint_data"](str(data))
    if failure == "checksum":
        payload_file.write_bytes(payload + b"damaged")
    if failure in ("partial-write", "new-file-write", "new-import-write"):
        actual_write = namespace["write_atomic"]
        writes = {"count": 0}

        def failing_write(filename, content, mode):
            writes["count"] += 1
            if failure == "partial-write" and writes["count"] == 2:
                raise RuntimeError("Injected replacement failure")
            if (failure == "new-import-write"
                    and filename.endswith("/public/app.js")
                    and not state["failureTriggered"]):
                assert (app / "lib/import-talents.js").read_bytes() == (
                    ROOT / "lib/import-talents.js").read_bytes()
                state["partialCreated"] = True
                state["failureTriggered"] = True
                raise RuntimeError("Injected replacement failure after the new backend module")
            if (failure == "new-file-write"
                    and filename.endswith("/public/talent-picker.js")
                    and not state["failureTriggered"]):
                assert (app / "public/usability.css").read_bytes() == (
                    ROOT / "public/usability.css").read_bytes()
                state["partialCreated"] = True
                state["failureTriggered"] = True
                raise RuntimeError("Injected replacement failure after a new asset")
            actual_write(filename, content, mode)

        namespace["write_atomic"] = failing_write
    if failure == "backup":
        shutil_proxy = types.SimpleNamespace(**{
            name: getattr(shutil, name)
            for name in dir(shutil) if not name.startswith("__")
        })

        def failing_copy(source, destination, **options):
            if str(destination).startswith(backup_name + "/"):
                raise RuntimeError("Injected backup failure")
            return shutil.copy2(source, destination, **options)

        shutil_proxy.copy2 = failing_copy
        namespace["shutil"] = shutil_proxy
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        returncode = namespace["main"]()
    text = output.getvalue()
    (fixture / "release-output.log").write_text(text, encoding="utf-8")
    assert state["status"] == "online", label + ": application not restored"
    live_data_changed = failure in (
        "live-three-seller-write", "live-write-before-rollback",
        "live-department-config-write",
    )
    if live_data_changed:
        expected_data = dict(before_data)
        if state["liveWriteBytes"] is not None:
            expected_data["sellers.json"] = {
                "bytes": len(state["liveWriteBytes"]), "sha256": sha(state["liveWriteBytes"]),
            }
        if state["liveConfigBytes"] is not None:
            expected_data["schedule-config.json"] = {
                "bytes": len(state["liveConfigBytes"]), "sha256": sha(state["liveConfigBytes"]),
            }
        assert namespace["fingerprint_data"](str(data)) == expected_data, label + ": live data was not preserved"
    else:
        assert namespace["fingerprint_data"](str(data)) == before_data, label + ": data changed"
    backup_dir = backup / ("release-" + label)
    rejected = {
        "checksum", "missing-asset", "extra-data", "path-traversal",
        "directory-target", "required-missing", "scripts-parent-file",
    }
    if failure is None:
        assert returncode == 0 and "RELEASE_OK" in text, text
        assert state["actions"] == ["stop", "restart", "save"]
        assert (backup_dir / "data-before.tar.gz").is_file()
        saved = json.loads((backup_dir / "state-before.json").read_text())
        assert set(saved["codeBefore"]) == set(ALLOWED)
        assert saved["dataFiles"] == before_data
        with tarfile.open(backup_dir / "data-before.tar.gz") as archive:
            for member in archive.getmembers():
                if member.isfile():
                    relative = member.name.removeprefix("data/")
                    assert archive.extractfile(member).read() == (data / relative).read_bytes()
        for relative in ALLOWED:
            assert (app / relative).read_bytes() == (ROOT / relative).read_bytes()
            entry = saved["codeBefore"][relative]
            assert entry["exists"] is (originals[relative] is not None)
            code_backup = backup_dir / "code" / relative
            if originals[relative] is None:
                assert entry["sha256"] is None and not code_backup.exists()
            else:
                assert code_backup.read_bytes() == originals[relative]
                assert entry["sha256"] == sha(originals[relative])
    elif live_data_changed:
        assert returncode == 1 and "RELEASE_ERROR" in text, text
        assert "RELEASE_OK" not in text and "ROLLBACK_OK" not in text and "ROLLBACK_ERROR" not in text, text
        assert "ROLLBACK_SKIPPED_DATA_CHANGED" in text and "RELEASE_REQUIRES_REVIEW" in text, text
        assert state["actions"] == ["stop", "restart", "stop", "restart", "save"]
        for relative in ALLOWED:
            assert (app / relative).read_bytes() == (ROOT / relative).read_bytes(), relative
        review = json.loads((backup_dir / "release-review-required.json").read_text())
        assert review["healthy"] is True and review["reviewRequired"] is True
        assert review["codeRestored"] is False and review["dataRestored"] is False
        assert review["dataMatchesStoppedSnapshot"] is False
        assert "dataUnchanged" not in review
        expected_talents = 3 if state["liveWriteBytes"] is not None else 1
        assert review["counts"]["talents"] == expected_talents and review["counts"]["schedules"] == 1
        if state["liveConfigBytes"] is not None:
            assert (data / "schedule-config.json").read_bytes() == state["liveConfigBytes"]
            with tarfile.open(backup_dir / "data-before.tar.gz") as archive:
                assert "data/schedule-config.json" not in archive.getnames()
        # The new loader reads all three people. The actual old config would
        # reject this live schedule, proving a rollback would break the site.
        if state["liveWriteBytes"] is not None:
            assert namespace["storage_counts"](NODE, app_name, str(data), str(data / "bookings.json"))["talents"] == 3
            old_limit = (backup_dir / "code/lib/config.js").read_bytes()
            assert b"const maxTalentsPerSchedule = 2;" in old_limit
            with tarfile.open(backup_dir / "data-before.tar.gz") as archive:
                assert archive.extractfile("data/sellers.json").read() != state["liveWriteBytes"]
    else:
        assert returncode == 1 and "RELEASE_ERROR" in text, text
        if failure in rejected:
            assert state["actions"] == [], state
        else:
            assert "ROLLBACK_OK" in text and "ROLLBACK_ERROR" not in text, text
        if failure in ("new-file-write", "new-import-write"):
            assert state["partialCreated"], "Failure did not follow an actual new asset write"
        if failure == "restart":
            assert state["failureTriggered"], "Restart failure was not exercised"
        for relative in ALLOWED:
            destination = app / relative
            if failure == "directory-target" and relative == "public/usability.css":
                assert destination.is_dir()
            elif originals[relative] is None:
                assert not destination.exists(), label + ": newly created file survived rollback"
            else:
                assert destination.read_bytes() == originals[relative], relative
        if failure in ("partial-write", "new-file-write", "new-import-write", "restart"):
            rollback = json.loads((backup_dir / "rollback-result.json").read_text())
            assert rollback["codeRestored"] is True
            assert rollback["dataRestored"] is False
            assert rollback["dataMatchesStoppedSnapshot"] is True
    report = {
        "case": label, "passed": True, "dataUnchanged": not live_data_changed,
        "liveWritesPreserved": live_data_changed,
        "newAssetsOriginallyAbsent": new_assets_absent,
        "pm2Actions": state["actions"], "fixture": str(fixture),
    }
    REPORTS.append(report)
    return report


class ReleaseWorkflowTests(unittest.TestCase):
    def test_install_new_assets_and_backup_absence(self):
        run_case("new-assets-success")

    def test_update_existing_assets_and_backup_bytes(self):
        run_case("existing-assets-success", new_assets_absent=False)

    def test_corrupt_payload_is_rejected_before_stop(self):
        run_case("corrupt-payload", "checksum")

    def test_incomplete_code_payload_is_rejected(self):
        run_case("missing-asset", "missing-asset")

    def test_optional_scripts_parent_cannot_replace_an_existing_file(self):
        run_case("scripts-parent-file", "scripts-parent-file")

    def test_extra_data_file_is_rejected(self):
        run_case("data-in-payload", "extra-data")

    def test_path_traversal_is_rejected(self):
        run_case("path-traversal", "path-traversal")

    def test_directory_asset_target_is_rejected(self):
        run_case("directory-target", "directory-target")

    def test_required_index_may_not_be_created(self):
        run_case("required-index-missing", "required-missing")

    def test_backup_failure_restarts_unchanged_code(self):
        run_case("backup-failure", "backup")

    def test_partial_existing_write_rolls_back(self):
        run_case("partial-write", "partial-write")

    def test_partial_new_asset_write_restores_absence(self):
        run_case("new-file-partial-write", "new-file-write")

    def test_partial_new_backend_module_write_restores_absence(self):
        run_case("new-backend-partial-write", "new-import-write")

    def test_restart_failure_removes_new_assets(self):
        run_case("new-assets-restart-failure", "restart")

    def test_restart_failure_restores_existing_assets(self):
        run_case("existing-assets-restart-failure", "restart", new_assets_absent=False)

    def test_three_seller_live_write_keeps_new_code_and_all_live_data(self):
        run_case("three-seller-live-write", "live-three-seller-write")

    def test_write_after_verification_failure_is_rechecked_after_stopping(self):
        run_case("live-write-before-rollback", "live-write-before-rollback")

    def test_new_live_department_configuration_prevents_code_rollback(self):
        run_case("live-department-config-write", "live-department-config-write")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ReleaseWorkflowTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report_file = OUTPUT / "latest-report.json"
    report_file.write_text(json.dumps({
        "passed": len(REPORTS), "successful": result.wasSuccessful(), "cases": REPORTS,
    }, indent=2) + "\n", encoding="utf-8")
    print("RELEASE_WORKFLOW_REPORT", report_file)
    raise SystemExit(0 if result.wasSuccessful() else 1)
