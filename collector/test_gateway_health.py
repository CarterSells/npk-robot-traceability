import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import gateway
import gateway_health as health


class HealthTests(unittest.TestCase):
    def window(self, start, end, known=False):
        with patch.object(gateway, 'utc', side_effect=[start, end]):
            result = gateway.sample(gateway.MockAdapter({}), ['ur.program_running'])
        if known:
            result['observations'][0].update(state='known', value=0, reason=None)
        return result

    def test_durable_replay_unknown_windows_and_unobserved_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            first = self.window('2026-11-03T00:00:00.000Z', '2026-11-03T00:00:02.000Z')
            second = self.window('2026-11-03T00:00:02.000Z', '2026-11-03T00:00:04.000Z')
            third = self.window('2026-11-03T00:00:10.000Z', '2026-11-03T00:00:12.000Z', True)
            health.record(temp, first)
            before = health.record(temp, second)
            self.assertEqual(before, health.record(temp, second))
            self.assertEqual(before['signals']['ur.program_running']['consecutive_unknown_window_seconds'], 4)
            result = health.record(temp, third)
            self.assertEqual(result['windows'], 3)
            self.assertEqual(result['unobserved_between_windows_seconds'], 6)
            stat = result['signals']['ur.program_running']
            self.assertEqual(stat['sampled_seconds'], 6)
            self.assertEqual(stat['unknown_window_seconds'], 4)
            self.assertEqual(stat['last_state'], 'known')
            self.assertEqual(stat['consecutive_unknown_window_seconds'], 0)
            self.assertEqual(result['reality'], 'synthetic')

    def test_conflicts_clock_reversal_binding_and_capacity_preserve_history(self):
        with tempfile.TemporaryDirectory() as temp:
            first = self.window('2026-11-03T00:00:00.000Z', '2026-11-03T00:00:02.000Z')
            expected = health.record(temp, first)
            conflict = copy.deepcopy(first); conflict['observations'][0]['reason'] = 'Different evidence'
            with self.assertRaises(ValueError): health.record(temp, conflict)
            overlap = self.window('2026-11-03T00:00:01.000Z', '2026-11-03T00:00:03.000Z')
            with self.assertRaises(ValueError): health.record(temp, overlap)
            other = self.window('2026-11-03T00:00:04.000Z', '2026-11-03T00:00:06.000Z')
            other['observations'][0]['topic'] = '/another/robot_program_running'
            with self.assertRaises(ValueError): health.record(temp, other)
            with patch.object(health, 'MAX_WINDOWS', 1):
                with self.assertRaises(ValueError): health.record(temp, self.window('2026-11-03T00:00:04.000Z', '2026-11-03T00:00:06.000Z'))
            self.assertEqual(health.record(temp, first), expected)
            with self.assertRaises(ValueError): health.record(Path(__file__).parent, first)


if __name__ == '__main__': unittest.main()
