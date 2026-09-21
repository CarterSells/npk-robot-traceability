import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

from pydantic import ValidationError

from .demo import load_demo
from .models import Manifest, ProjectInput, RobotInput, RunInput
from .service import Problem, Store


def validation_errors(error):
    # Never echo submitted input: it may contain a rejected credential-bearing URL.
    return [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
            for e in error.errors(include_input=False, include_url=False)]


def main():
    parser = argparse.ArgumentParser(description="NPK local robot traceability")
    parser.add_argument("--db", default=os.getenv("NPK_DB", "data/npk.sqlite3"))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="Initialize the database")
    commands.add_parser("demo", help="Load repeatable synthetic data")
    project = commands.add_parser("project", help="Register a project")
    project.add_argument("id")
    project.add_argument("name")
    robot = commands.add_parser("robot", help="Register a robot")
    robot.add_argument("id")
    robot.add_argument("--project", required=True)
    robot.add_argument("--name", required=True)
    robot.add_argument("--serial")
    release = commands.add_parser("release", help="Register an immutable manifest")
    release.add_argument("manifest", type=Path)
    release.add_argument("--local-file", action="append", default=[], metavar="TYPE=PATH",
                         help="Verify an explicitly selected local file against the manifest hash")
    run = commands.add_parser("run", help="Record a run")
    run.add_argument("id")
    run.add_argument("--robot", required=True)
    run.add_argument("--release", required=True)
    run.add_argument("--outcome", choices=("success", "failure", "unknown"), required=True)
    run.add_argument("--notes", default="")
    run.add_argument("--recording-url")
    run.add_argument("--timestamp")
    inspect = commands.add_parser("inspect", help="Inspect a run and all five artifacts")
    inspect.add_argument("run_id")
    compare = commands.add_parser("compare", help="Compare recorded artifact identifiers")
    compare.add_argument("before")
    compare.add_argument("after")
    serve = commands.add_parser("serve", help="Serve on localhost")
    serve.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    store = Store(args.db)
    try:
        if args.command == "init":
            store.initialize()
            result = {"initialized": str(store.path)}
        elif args.command == "serve":
            import uvicorn
            from .web import create_app
            store.initialize()
            uvicorn.run(create_app(args.db), host="127.0.0.1", port=args.port, access_log=False)
            return 0
        elif args.command == "demo":
            result = load_demo(store)
        elif args.command == "project":
            result = store.project(ProjectInput(id=args.id, name=args.name))
        elif args.command == "robot":
            result = store.robot(RobotInput(id=args.id, project_id=args.project, name=args.name, serial=args.serial))
        elif args.command == "release":
            pairs = [item.split("=", 1) for item in args.local_file]
            if any(len(pair) != 2 or not pair[1] for pair in pairs) or len({p[0] for p in pairs}) != len(pairs):
                raise Problem("Use each --local-file once per type, formatted TYPE=PATH")
            result = store.release(Manifest.model_validate(json.loads(args.manifest.read_text())), dict(pairs))
        elif args.command == "run":
            result = store.run(RunInput(id=args.id, robot_id=args.robot, release_id=args.release,
                                       outcome=args.outcome, notes=args.notes, recording_url=args.recording_url,
                                       timestamp=args.timestamp))
        elif args.command == "inspect":
            result = store.get_run(args.run_id)
        else:
            result = store.compare(args.before, args.after)
        print(json.dumps(result, indent=2))
        return 0
    except ValidationError as error:
        print(json.dumps({"error": "Invalid input", "details": validation_errors(error)}), file=sys.stderr)
        return 2
    except Problem as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return {404: 3, 409: 4}.get(error.status, 2)
    except (OSError, sqlite3.Error, ValueError):
        print(json.dumps({"error": "Cannot read input or database. Check JSON, file permissions, and run init first."}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
