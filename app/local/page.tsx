import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Workspace from './workspace';
import './workspace.css';

export const metadata: Metadata = { title: 'Tavrik — Robot workspace', robots: { index: false, follow: false } };
export default function LocalPage() {
  // Real-record tooling is never part of the public static release.
  if (process.env.NODE_ENV !== 'development') notFound();
  return <Workspace />;
}
