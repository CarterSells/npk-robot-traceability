import type { Metadata } from 'next';
import './style.css';
import '../../app/local/workspace.css';
export const metadata: Metadata = { title: 'Tavrik · Private workspace', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
