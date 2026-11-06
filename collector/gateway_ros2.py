"""Optional ROS 2 subscriber. Never starts a driver or creates command clients."""
import time
from gateway import SIGNALS, controller_name, selection, utc

class Ros2Adapter:
    name = 'ros2-ur'

    def _run(self, names, controller, window, discover=False):
        controller_name(controller)
        if not 0.1 <= window <= 10: raise ValueError('Invalid sampling window.')
        if not discover: selection(names)
        import rclpy
        from rclpy.context import Context
        from rclpy.executors import SingleThreadedExecutor
        from rclpy.node import Node
        from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
        context = Context()
        rclpy.init(args=[], context=context)
        node = None
        executor = None
        try:
            node = Node('tavrik_monitor', context=context, use_global_arguments=False,
                        enable_rosout=False, start_parameter_services=False)
            executor = SingleThreadedExecutor(context=context)
            executor.add_node(node)
            values = {}
            if not discover:
                from std_msgs.msg import Bool
                from ur_dashboard_msgs.msg import RobotMode, SafetyMode
                types = {'std_msgs/msg/Bool': Bool, 'ur_dashboard_msgs/msg/RobotMode': RobotMode,
                         'ur_dashboard_msgs/msg/SafetyMode': SafetyMode}
                qos = QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT, durability=DurabilityPolicy.VOLATILE)
                for name in names:
                    topic, kind, field, _, _ = SIGNALS[name]
                    def receive(message, key=name, attribute=field):
                        values[key] = {'value': getattr(message, attribute), 'received_at': utc()}
                    node.create_subscription(types[kind], controller+'/'+topic, receive, qos)
            deadline = time.monotonic()+window
            while time.monotonic() < deadline:
                executor.spin_once(timeout_sec=min(0.1, max(0, deadline-time.monotonic())))
            if discover:
                available = dict(node.get_topic_names_and_types())
                return [{'name': name, 'topic': controller+'/'+spec[0], 'type': spec[1]}
                        for name, spec in SIGNALS.items() if spec[1] in available.get(controller+'/'+spec[0], [])]
            return values
        finally:
            if executor is not None: executor.shutdown()
            if node is not None: node.destroy_node()
            rclpy.shutdown(context=context)

    def discover(self, controller, window):
        return self._run([], controller, window, True)

    def read(self, names, controller, window):
        return self._run(names, controller, window)
