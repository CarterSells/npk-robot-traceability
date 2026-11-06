# Read-only robot gateway (B9)

Implements the approved-metadata workflow in [build.md sections 6 and 7](../build.md), using [B5 machine identities](machine-ingestion.md) and the [B6 execution-event contract](execution-evidence.md). Software mock checks do not establish ROS, simulator or physical-robot acceptance. No driver is started and no robot command, service client or motion publisher is created.

[B10 controlled requests](controlled-commands.md) add a separate software simulation runner. They do not extend this ROS adapter with motion control or give existing monitoring credentials command permission.

## Supported observation contract

`collector/gateway.py` works without ROS. `gateway_ros2.py` optionally subscribes to an already running, operator-configured Universal Robots ROS 2 driver. Select signals explicitly; discovery does not authorize capture. The default controller namespace is `/io_and_status_controller`; supply `--controller` for a namespaced installation.

| Signal | Topic suffix | ROS message / field | Stored unit |
| --- | --- | --- | --- |
| ur.robot_mode | robot_mode | ur_dashboard_msgs/msg/RobotMode / mode | code |
| ur.safety_mode | safety_mode | ur_dashboard_msgs/msg/SafetyMode / mode | code |
| ur.program_running | robot_program_running | std_msgs/msg/Bool / data | boolean (0/1) |

Codes are raw driver enum values, not normalized safety or readiness conclusions. Program-running refers to the driver's External Control program, not successful completion of a Tavrik job. These messages have no source timestamp: `.received` measurements record gateway receipt time, never robot event time. Backend recorded time remains separate. Preserve the local observation file for adapter, topic and sampling-window provenance.

Sampling uses a 0.1–10 second window, volatile best-effort subscriptions with depth one, and validates the last received value per selected signal. High-frequency streams are not uploaded. Missing/invalid messages become unknown with a reason; a known false is zero, not unknown. Each new window starts empty, so reconnection does not reuse a prior value. A valid sample does not prove uninterrupted connectivity. Adapter runtime/I/O failures produce unknown observations with a generic adapter-unavailable reason. Missing ROS dependencies, invalid setup and process termination can prevent an observation entirely: a scheduler must record those capture failures separately, never count them as successful monitoring. Continuous gap-duration aggregation is not implemented.

## Install and review before connecting

Use the existing Python collector on Windows for mock development. On a robot-side Linux host, use the Python environment supplied by the selected ROS distribution with `rclpy`, `std_msgs` and `ur_dashboard_msgs` installed. No ROS dependency is added to the base collector. ROS Jazzy API sources informed the adapter; no deployed distribution/controller combination is certified here.

Before setting `--compatibility-reviewed`, record outside the repository: robot model, controller/PolyScope version, ROS distribution, Python version, UR driver/package versions, namespace, ROS_DOMAIN_ID, RMW implementation, topic types/QoS, operator approval and network boundary. Verify against the installed driver's documentation. An operator must already have safely configured the driver; this gateway does not launch it. Run against a simulator first, then perform supervised physical acceptance. The flag records an operator acknowledgement, not an automated compatibility check.

Keep DDS discovery and robot traffic on the approved local network. Only explicit queue flush uses outbound HTTPS to Tavrik; no inbound internet access to the controller is required. Enroll a robot-scoped machine identity with `events:write` and receipt-read access under the existing identity workflow. Keep its token in `UNIFY_MACHINE_TOKEN`, never in observation files or command arguments. Existing legacy environment names remain intentional.

Create a private directory outside the repository before capture, with restrictive owner-only permissions (Windows ACLs or Linux mode 0700). Files use mode 0600 where supported. Do not put customer metadata in fixtures, source control, public assets or shared temporary directories. Allocate persistent event UUIDs and monotonically increasing identity-wide sequences through your runner; do not reuse them for different observations. Keep the exact attempt context stable, including robot, snapshot ID/revision, job/attempt IDs, procedure and evidence reality.

## Explicit capture and handoff

Examples use `/private/tavrik` as an already configured private directory; replace it with your real path. For Windows, invoke the installed Python executable and use an absolute private Windows path.

1. Create `values.json` containing synthetic values such as `{"ur.robot_mode":7,"ur.program_running":false}`.
2. Discover supported synthetic fields:

```sh
python collector/gateway.py discover --adapter mock --mock-values /private/tavrik/values.json --output /private/tavrik/discovery.json
```

3. Review and sample selected fields into a new file:

```sh
python collector/gateway.py sample --adapter mock --mock-values /private/tavrik/values.json --signals ur.robot_mode ur.program_running --reality synthetic --reviewed --output /private/tavrik/observation.json
```

For an approved simulator installation, replace `--adapter mock --mock-values ...` with `--adapter ros2-ur --compatibility-reviewed`, use `--reality simulation`, and optionally `--window 2 --controller /io_and_status_controller`. Real observations require `--reality real`; mock data cannot be labeled real or simulation.

4. Review the observation and an existing B6 attempt JSON object. Its `method` must be `collector`; its `reality` must match. Enqueue one selected measurement with a persisted UUID/sequence:

```sh
python collector/gateway.py enqueue --observation /private/tavrik/observation.json --signal ur.program_running --attempt /private/tavrik/attempt.json --event-id YOUR-PERSISTED-UUID --sequence 7 --queue /private/tavrik/events --reviewed
python collector/upload_queue.py --queue /private/tavrik/events flush-events --endpoint https://YOUR-BETA-HOST/api/v1/events
```

The first command is local-only. The second requires the configured HTTPS beta and scoped credential. It uses exact-byte receipt reconciliation before sending. Retrying the same observation/context/UUID/sequence deduplicates; do not resample to retry an old upload. The referenced snapshot must already exist in the correct organization and robot scope. Measurements do not create test outcomes or alter snapshot history. B6 treats competing values for the same named measurement in an attempt as ambiguous; this handoff is for selected run observations, not a live time-series dashboard. Existing approved evidence references can link external recordings; this gateway does not ingest recordings.

The shared queue is bounded at 1,000 entries/256 MiB; full queues fail without dropping existing entries. Monitor failures/disk space and flush deliberately. This is not proof of 24-hour retention at the roadmap workload. Preserve original observations and attempt context until acknowledged and according to the organization's retention policy. Stop capture/flush before upgrading, retain private queue files, test schema compatibility using synthetic data, and resume existing bytes. Roll back code without clearing or rewriting queued events. Lost files or unclean power-loss durability require operational recovery testing.

## Adapter extension and acceptance

An adapter exposes `name`, `discover(controller, window)` returning only approved name/topic/type mappings, and `read(names, controller, window)` returning a bounded map of `{value, received_at}`. New adapters require an explicit signal allowlist, units, validation, evidence clock/reality semantics and failure tests before enabling. ABB, FANUC and OPC UA adapters are not implemented: inventory controller software, licensed interface options, authentication and read privileges for each customer first. A protocol name does not imply availability on every robot.

Required external checks: approved simulator topic/type/QoS match; driver disconnect and reconnect without stale carryover; safe-mode/status mapping against the exact installed version; no command interfaces; identity revocation; exact snapshot/run linkage in the hosted portal; measured queue retention and Linux crash recovery. Hardware acceptance must be supervised and does not authorize motion control.

References: [UR controller interfaces](https://docs.universal-robots.com/Universal_Robots_ROS_Documentation/rolling/doc/ur_robot_driver/ur_controllers/doc/index.html), [ROS Jazzy Node source](https://github.com/ros2/rclpy/blob/jazzy/rclpy/rclpy/node.py), [ROS Jazzy QoS](https://github.com/ros2/rclpy/blob/jazzy/rclpy/rclpy/qos.py).
