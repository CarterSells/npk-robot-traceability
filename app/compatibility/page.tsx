import type { Metadata } from 'next';
import Registry from './registry';
import { MarketingShell } from '../marketing-shell';
export const metadata: Metadata = { title:'Tavrik — Synthetic compatibility registry', description:'An evidence-scoped compatibility concept using invented examples only.', robots:{ index:false, follow:false }, alternates:{ canonical:'/compatibility/' } };
export default function CompatibilityPage() { return <MarketingShell active=""><Registry /></MarketingShell>; }
