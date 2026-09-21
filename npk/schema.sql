PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS robots (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 name TEXT NOT NULL, serial TEXT,
 UNIQUE(id, project_id)
);
CREATE TABLE IF NOT EXISTS artifacts (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 type TEXT NOT NULL CHECK(type IN ('hardware','firmware','dataset','model','configuration')),
 label TEXT NOT NULL, source TEXT NOT NULL,
 version TEXT, sha256 TEXT, verification TEXT NOT NULL
 CHECK(verification IN ('unverified_reference','verified_local_sha256')),
 timestamp TEXT NOT NULL,
 CHECK(version IS NOT NULL OR sha256 IS NOT NULL),
 CHECK(verification != 'verified_local_sha256' OR sha256 IS NOT NULL),
 UNIQUE(id, project_id, type)
);
CREATE TABLE IF NOT EXISTS releases (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 creator TEXT NOT NULL, timestamp TEXT NOT NULL, parent_release_id TEXT,
 manifest_json TEXT NOT NULL,
 UNIQUE(id, project_id),
 FOREIGN KEY(parent_release_id, project_id) REFERENCES releases(id, project_id)
);
CREATE TABLE IF NOT EXISTS release_artifacts (
 release_id TEXT NOT NULL, project_id TEXT NOT NULL, type TEXT NOT NULL,
 artifact_id TEXT NOT NULL,
 PRIMARY KEY(release_id, type),
 FOREIGN KEY(release_id, project_id) REFERENCES releases(id, project_id),
 FOREIGN KEY(artifact_id, project_id, type) REFERENCES artifacts(id, project_id, type)
);
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
 robot_id TEXT NOT NULL, release_id TEXT NOT NULL, timestamp TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','unknown')),
 notes TEXT NOT NULL, recording_url TEXT, input_json TEXT NOT NULL,
 FOREIGN KEY(robot_id, project_id) REFERENCES robots(id, project_id),
 FOREIGN KEY(release_id, project_id) REFERENCES releases(id, project_id)
);
CREATE INDEX IF NOT EXISTS runs_robot_time ON runs(robot_id, timestamp);
