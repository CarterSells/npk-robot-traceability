import os
import sqlite3
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .models import ID, Manifest, ProjectInput, RobotInput, RunInput
from .service import Problem, Store


def create_app(db_path=None):
    app = FastAPI(title="NPK • Robot traceability", version="0.1.0")
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])
    store = Store(db_path or os.getenv("NPK_DB", "data/npk.sqlite3"))
    folder = Path(__file__).parent
    templates = Jinja2Templates(directory=str(folder / "templates"))
    app.mount("/static", StaticFiles(directory=folder / "static"), name="static")

    @app.middleware("http")
    async def local_safety(request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            # Prevent drive-by writes from unrelated websites to this unauthenticated local demo.
            if request.headers.get("origin") not in (None, str(request.base_url).rstrip("/")):
                return JSONResponse({"error": "Cross-origin writes are not allowed"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path != "/docs":
            response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        return response

    @app.exception_handler(Problem)
    async def problem(request, error):
        if not request.url.path.startswith("/api/"):
            return templates.TemplateResponse(request=request, name="error.html",
                                               context={"message": str(error)}, status_code=error.status)
        return JSONResponse({"error": str(error)}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def invalid(request, error):
        # RequestValidationError.errors has a different signature than Pydantic's method.
        details = [{"field": ".".join(map(str, e["loc"])), "message": e["msg"]} for e in error.errors()]
        return JSONResponse({"error": "Invalid input", "details": details}, status_code=422)

    @app.exception_handler(sqlite3.Error)
    async def database_error(request, error):
        return JSONResponse({"error": "Database unavailable. Run init and check local file permissions."}, status_code=503)

    @app.post("/api/init")
    def initialize():
        store.initialize()
        return {"initialized": True}

    @app.post("/api/projects")
    def project(value: ProjectInput):
        return store.project(value)

    @app.post("/api/robots")
    def robot(value: RobotInput):
        return store.robot(value)

    @app.post("/api/releases")
    def release(value: Manifest):
        return store.release(value)

    @app.get("/api/releases/{release_id}")
    def get_release(release_id: ID):
        return store.get_release(release_id)

    @app.post("/api/runs")
    def run(value: RunInput):
        return store.run(value)

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: ID):
        return store.get_run(run_id)

    @app.get("/api/compare")
    def compare(before: Annotated[ID, Query()], after: Annotated[ID, Query()]):
        return store.compare(before, after)

    @app.get("/api/robots")
    def robots():
        return store.dashboard()

    @app.get("/")
    def dashboard(request: Request):
        return templates.TemplateResponse(request=request, name="dashboard.html", context=store.dashboard())

    @app.get("/runs/{run_id}")
    def detail(request: Request, run_id: ID):
        return templates.TemplateResponse(request=request, name="run.html", context={"run": store.get_run(run_id)})

    @app.get("/compare")
    def comparison(request: Request, before: Annotated[ID, Query()], after: Annotated[ID, Query()]):
        return templates.TemplateResponse(request=request, name="compare.html", context=store.compare(before, after))

    return app
