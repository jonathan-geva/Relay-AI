"""Relay's adapter for the pinned ChatMock version. No credentials are printed."""
import argparse
import hmac
import os
import sys
import threading
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("command", choices=["status", "login", "serve"])
parser.add_argument("--port", type=int, default=8317)
parser.add_argument("--token-file")
args = parser.parse_args()

if args.command == "status":
    from chatmock.utils import read_auth_file
    auth = read_auth_file() or {}
    tokens = auth.get("tokens") or {}
    print("ready" if tokens.get("access_token") and tokens.get("id_token") else "missing")
elif args.command == "login":
    from chatmock.cli import main
    sys.argv = ["chatmock", "login", "--no-browser"]
    main()
else:
    from chatmock.app import create_app
    from flask import jsonify, request
    from werkzeug.serving import make_server
    token = Path(args.token_file).read_text().strip()
    if len(token) != 64:
        raise RuntimeError("Invalid Relay server token")
    app = create_app(
        reasoning_effort=os.getenv("CHATGPT_LOCAL_REASONING_EFFORT", "medium"),
        reasoning_summary=os.getenv("CHATGPT_LOCAL_REASONING_SUMMARY", "auto"),
        reasoning_compat=os.getenv("CHATGPT_LOCAL_REASONING_COMPAT", "o3"),
    )

    @app.before_request
    def relay_auth():
        if not hmac.compare_digest(request.headers.get("Authorization", ""), "Bearer " + token):
            return jsonify(error="Unauthorized"), 401

    @app.get("/relay/health")
    def relay_health():
        return jsonify(service="relay-chatmock")

    @app.post("/relay/stop")
    def relay_stop():
        threading.Thread(target=server.shutdown, daemon=True).start()
        return jsonify(stopping=True)

    server = make_server("127.0.0.1", args.port, app, threaded=True)
    server.serve_forever()
    server.server_close()
