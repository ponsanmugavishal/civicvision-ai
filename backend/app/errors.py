"""Consistent error responses: `{"detail": str, "field_errors": {field: message}}`."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status: int, message: str, field_errors: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.field_errors = field_errors or {}


def forbidden(message: str = "You do not have permission to perform this action.") -> AppError:
    return AppError(403, message)


def not_found(message: str = "The requested record was not found.") -> AppError:
    return AppError(404, message)


def invalid(message: str, field_errors: dict[str, str] | None = None) -> AppError:
    return AppError(422, message, field_errors)


def unauthenticated(message: str = "Please sign in to continue.") -> AppError:
    return AppError(401, message)


def conflict(message: str) -> AppError:
    return AppError(409, message)


def too_many(message: str) -> AppError:
    return AppError(429, message)


def require_min_length(value: str | None, n: int, field: str, label: str) -> None:
    if len((value or "").strip()) < n:
        raise invalid(f"{label} must be at least {n} characters.", {field: f"At least {n} characters required."})


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else None
        return JSONResponse({"detail": exc.message, "field_errors": exc.field_errors}, status_code=exc.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path", "form")]
            fields[".".join(loc) or "request"] = err.get("msg", "Invalid value")
        first = next(iter(fields.items()), ("request", "Invalid request"))
        return JSONResponse({"detail": f"Invalid {first[0]}: {first[1]}", "field_errors": fields}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return JSONResponse({"detail": exc.detail, "field_errors": {}}, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):  # never leak internals
        import logging

        logging.getLogger("civicvision").exception("Unhandled error", exc_info=exc)
        return JSONResponse({"detail": "An unexpected error occurred. Please try again.", "field_errors": {}}, status_code=500)
