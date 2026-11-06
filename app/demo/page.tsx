import type { Metadata } from 'next';
import Demo from './workspace';
import './demo.css';

export const metadata: Metadata = {
  title: 'Tavrik — Synthetic test-history demo',
  description: 'Explore invented robot runs, configuration history, and recorded differences. No customer data or automatic diagnosis.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/demo/' },
};
export default function DemoPage() { return <Demo workspaceAvailable={process.env.NODE_ENV === 'development'} />; }
