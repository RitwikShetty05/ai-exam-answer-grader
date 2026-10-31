import os
import sys
import time
import shutil
import signal
import socket
import subprocess
import webbrowser
import importlib.util

ROOT_FOLDER = os.path.dirname(os.path.abspath(__file__))
RUN_FOLDER = os.path.join(ROOT_FOLDER, "run")
LOG_FOLDER = os.path.join(ROOT_FOLDER, "logs")
BACKEND_FOLDER = os.path.join(ROOT_FOLDER, "web", "backend")
SOURCE_FOLDER = os.path.join(ROOT_FOLDER, "src")
APP_ADDRESS = "http://localhost:8001"

OLLAMA_PORT = 11434
API_PORT = 8000
WEB_PORT = 8001

needed_packages = ["django", "fastapi", "uvicorn", "torch", "transformers", "whitenoise", "requests"]

ollama_places = [
    "/usr/local/bin/ollama",
    "/opt/homebrew/bin/ollama",
    "/Applications/Ollama.app/Contents/Resources/ollama",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe"),
]


def port_is_open(port):
    connection = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    connection.settimeout(0.5)
    try:
        return connection.connect_ex(("127.0.0.1", port)) == 0
    finally:
        connection.close()


def wait_for_port(port, seconds, should_be_open=True):
    end = time.time() + seconds
    while time.time() < end:
        if port_is_open(port) == should_be_open:
            return True
        time.sleep(0.5)
    return port_is_open(port) == should_be_open


def pid_file(name):
    return os.path.join(RUN_FOLDER, name + ".pid")


def find_ollama():
    found = shutil.which("ollama")
    if found:
        return found
    for place in ollama_places:
        if place and os.path.exists(place):
            return place
    return None


def missing_packages():
    missing = []
    for name in needed_packages:
        if importlib.util.find_spec(name) is None:
            missing.append(name)
    return missing


def start_process(name, command, folder):
    log = open(os.path.join(LOG_FOLDER, name + ".log"), "a")
    options = {"cwd": folder, "stdout": log, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        options["start_new_session"] = True
    process = subprocess.Popen(command, **options)
    with open(pid_file(name), "w") as file:
        file.write(str(process.pid))
    return process


def kill_process(pid):
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass


def pids_on_port(port):
    pids = []
    if os.name == "nt":
        reply = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True)
        for line in reply.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[1].endswith(":" + str(port)) and parts[3] == "LISTENING":
                pids.append(int(parts[4]))
    else:
        reply = subprocess.run(["lsof", "-nP", "-t", "-iTCP:" + str(port), "-sTCP:LISTEN"], capture_output=True, text=True)
        for line in reply.stdout.split():
            if line.strip().isdigit():
                pids.append(int(line.strip()))
    unique = []
    for pid in pids:
        if pid not in unique and pid != os.getpid():
            unique.append(pid)
    return unique


def read_pid(name):
    path = pid_file(name)
    if not os.path.exists(path):
        return None
    with open(path) as file:
        text = file.read().strip()
    if text.isdigit():
        return int(text)
    return None


def forget(name):
    path = pid_file(name)
    if os.path.exists(path):
        os.remove(path)


def stop_ollama_if_started():
    pid = read_pid("ollama")
    forget("ollama")
    if pid is None or not port_is_open(OLLAMA_PORT):
        return False
    kill_process(pid)
    return True


def stop_port(name, port):
    forget(name)
    pids = pids_on_port(port)
    for pid in pids:
        kill_process(pid)
    return len(pids) > 0


def show(text):
    print(text, flush=True)


def start_all():
    os.makedirs(RUN_FOLDER, exist_ok=True)
    os.makedirs(LOG_FOLDER, exist_ok=True)
    show("")
    show("  AI Exam Answer Grader  ·  Group 2")
    show("  Starting the local web app...")
    show("")

    missing = missing_packages()
    if len(missing) > 0:
        show("  These Python packages are missing: " + ", ".join(missing))
        show("  Install them with:  " + sys.executable + " -m pip install -r requirements.txt")
        return 1

    python = sys.executable
    if port_is_open(OLLAMA_PORT):
        show("  [ok]   Ollama (local LLM) is already running")
    else:
        ollama = find_ollama()
        if ollama is None:
            show("  [--]   Ollama is not installed: marks will come from the similarity model only")
        else:
            start_process("ollama", [ollama, "serve"], ROOT_FOLDER)
            show("  [..]   Starting Ollama (local LLM)")

    if port_is_open(API_PORT):
        show("  [ok]   Grading API is already running on port " + str(API_PORT))
    else:
        start_process("grading api", [python, "-m", "uvicorn", "api:app", "--host", "127.0.0.1", "--port", str(API_PORT)], SOURCE_FOLDER)
        show("  [..]   Starting the grading API (loads the TinyBERT model)")

    if port_is_open(WEB_PORT):
        show("  [ok]   Web app is already running on port " + str(WEB_PORT))
    else:
        with open(os.path.join(LOG_FOLDER, "web app.log"), "a") as log:
            subprocess.run([python, "manage.py", "migrate", "--noinput"], cwd=BACKEND_FOLDER, stdout=log, stderr=subprocess.STDOUT)
        start_process("web app", [python, "manage.py", "runserver", "127.0.0.1:" + str(WEB_PORT), "--noreload"], BACKEND_FOLDER)
        show("  [..]   Starting the web app")

    show("")
    ready = True
    for title, port, seconds in [("Ollama", OLLAMA_PORT, 30), ("Grading API", API_PORT, 180), ("Web app", WEB_PORT, 60)]:
        if title == "Ollama" and find_ollama() is None and not port_is_open(OLLAMA_PORT):
            continue
        if wait_for_port(port, seconds):
            show("  [ok]   " + title + " is ready on port " + str(port))
        else:
            ready = False
            show("  [!!]   " + title + " did not start. See the logs folder: " + LOG_FOLDER)

    if not ready:
        return 1
    show("")
    show("  Opening " + APP_ADDRESS)
    show("  To stop: press 'Shut down' in the app, or run Stop Grader.")
    webbrowser.open(APP_ADDRESS)
    return 0


def stop_all():
    os.makedirs(RUN_FOLDER, exist_ok=True)
    show("")
    show("  Stopping the AI Exam Answer Grader...")
    for name, title, port in [("web app", "Web app", WEB_PORT), ("grading api", "Grading API", API_PORT)]:
        if stop_port(name, port):
            wait_for_port(port, 10, should_be_open=False)
            show("  [ok]   " + title + " stopped")
        else:
            show("  [--]   " + title + " was not running")
    if stop_ollama_if_started():
        wait_for_port(OLLAMA_PORT, 10, should_be_open=False)
        show("  [ok]   Ollama stopped")
    elif port_is_open(OLLAMA_PORT):
        show("  [--]   Ollama was already running before the app started, so it is left running")
    show("")
    show("  Everything is stopped.")
    return 0


if __name__ == "__main__":
    action = "start"
    if len(sys.argv) > 1:
        action = sys.argv[1]
    if action == "stop":
        sys.exit(stop_all())
    sys.exit(start_all())
