# B4 permission matrix and project boundaries

Implements [B4](backend-master-prompts.md), preserving [build.md](../build.md) evidence and organization boundaries. This matrix is the implementation contract; verification status belongs in build-progress.md.

| Capability | Owner | Admin | Engineer | Operator | Internal viewer | Client viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Read internal records/export | Yes | Yes | Yes | Yes | Yes | No |
| Create/correct configurations and investigations | Yes | Yes | Yes | No | No | No |
| Append runs with approved captured snapshots | Yes | Yes | Yes | Yes | No | No |
| Configure integrations / issue credentials | Yes | Yes | No | No | No | No |
| Request jobs | Yes | Yes | Yes | Yes | No | No |
| Approve commands | Yes | Yes | No | No | No | No |
| Publish selected run summaries | Yes | Yes | Yes | No | No | No |
| Manage teams, clients, projects and invitations | Yes | Yes | No | No | No | No |
| Change owners / delete organization | Yes | No | No | No | No | No |
| Read explicitly shared project fields | Yes | Yes | Yes | Yes | Yes | Explicit grant only |

Legacy `member` means engineer and `viewer` means internal viewer. They remain readable for compatibility. Client viewers are never inserted into organization membership. Teams contain existing organization members and do not confer extra privileges. Client access requires an explicit project grant bound to the project's client and organization. A person may separately hold an internal membership; that membership independently authorizes internal access.

Project/run sharing is deliberate: an administrator associates a robot with a project, then an authorized publisher shares a run of that robot. The first share fixes the run's project association. Shared fields are limited to run ID, recorded outcome, observed time and the synthetic indicator; internal configuration, evidence URLs and investigation notes are excluded. This is a restricted shared-run summary, not B11's complete report/webhook system.

Client invitations expire after seven days, are single-use and require the authenticated verified email. Tokens are hashed and shown once; no email is sent. Revoking a grant stops subsequent API and direct RLS reads. Client queries are paginated and reauthorize each page. Internal exports continue to use the organization membership/session boundary. No private object buckets, subscriptions or workers are added by B4; future implementations must use these same current grants rather than treating a cached token as permission.

Request/approve capabilities now apply to the [B10 simulation-only API](controlled-commands.md), with a separate opt-in machine grant and mandatory approval. Physical job execution remains unsupported. B8 connector software and simulated-provider verification are documented in [Onshape integration](onshape-integration.md); live provider acceptance remains separate. Customer hosting and recovery gates remain unchanged.
