'use client';
import { useState, type ReactNode } from 'react';

const layers = [
  { id: 'hardware', title: 'Hardware', text: 'A gripper swap changes the physical setup. Keep the component identity, revision, and operator confirmation beside the run. Hardware reports in this demo are manual.' },
  { id: 'policy', title: 'Policy + data', text: 'Follow the recorded policy version and its teleoperation dataset reference together. A version identifies the record; it does not verify the underlying weights or dataset.' },
  { id: 'calibration', title: 'Calibration + firmware', text: 'Inspect firmware and calibration versions alongside the physical setup. A recorded difference is a starting point for investigation, not proof of a cause.' },
] as const;

export default function LayerExplorer({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string>('hardware');
  const layer = layers.find(item => item.id === selected)!;
  return <div className="layer-explorer" data-layer={selected}>
    {children}
    <p className="layer-prompt">Explore a configuration layer</p>
    <div className="layer-controls" role="group" aria-label="Configuration layers">{layers.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} aria-controls="layer-description" onClick={() => setSelected(item.id)}>{item.title}</button>)}</div>
    <p id="layer-description" className="layer-description" aria-live="polite" aria-atomic="true">{layer.text}</p>
  </div>;
}
