"""Versioned input contracts shared by CLI and HTTP routes."""

from datetime import datetime, timezone
from typing import Annotated, Literal
from urllib.parse import unquote, urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

KINDS = ("hardware", "firmware", "dataset", "model", "configuration")
Kind = Literal["hardware", "firmware", "dataset", "model", "configuration"]
ID = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


def safe_url(value: str) -> str:
    """Reject credentials and query/fragment tokens instead of trying to redact them."""
    try:
        parsed = urlsplit(value)
        decoded = unquote(value)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.query or parsed.fragment or "?" in value or "#" in value
                or "\\" in decoded or any(ord(c) <= 32 or ord(c) == 127 for c in decoded)
                or len(value) > 2000):
            raise ValueError
        parsed.port
    except ValueError:
        raise ValueError("Use an http/https URL without credentials, query strings, or fragments") from None
    return value


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ProjectInput(Strict):
    id: ID
    name: Text


class ArtifactInput(Strict):
    type: Kind
    label: Text
    source: str
    version: Text | None = None
    sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")] | None = None

    _url = field_validator("source")(safe_url)

    @model_validator(mode="after")
    def identity(self):
        if not self.version and not self.sha256:
            raise ValueError("An artifact needs an immutable version or SHA-256 hash")
        return self


class Manifest(Strict):
    schema_version: Literal[1]
    release_id: ID
    project: ProjectInput
    creator: Text
    parent_release_id: ID | None = None
    artifacts: list[ArtifactInput] = Field(min_length=5, max_length=5)

    @field_validator("schema_version", mode="before")
    @classmethod
    def integer_schema(cls, value):
        if type(value) is not int:
            raise ValueError("Schema version must be the integer 1")
        return value

    @model_validator(mode="after")
    def five_types(self):
        if {a.type for a in self.artifacts} != set(KINDS):
            raise ValueError("Require exactly one artifact of each of the five types")
        if self.parent_release_id == self.release_id:
            raise ValueError("A release cannot be its own parent")
        return self


class RobotInput(Strict):
    id: ID
    project_id: ID
    name: Text
    serial: Text | None = None


class RunInput(Strict):
    id: ID
    robot_id: ID
    release_id: ID
    outcome: Literal["success", "failure", "unknown"]
    notes: Annotated[str, StringConstraints(max_length=10000)] = ""
    recording_url: str | None = None
    timestamp: str | None = None

    @field_validator("recording_url")
    @classmethod
    def url(cls, value):
        return safe_url(value) if value is not None else None

    @field_validator("timestamp")
    @classmethod
    def timestamp_format(cls, value):
        if value is not None:
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    raise ValueError
                dt.astimezone(timezone.utc)
            except (ValueError, OverflowError):
                raise ValueError("Timestamp must be ISO 8601 with a timezone") from None
        return value
