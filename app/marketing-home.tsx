import Link from 'next/link';
import { MarketingShell, RecordSculpture, EditorialLink, localWorkspace } from './marketing-shell';
import { demoRecords } from '../lib/demo/fixtures';
import { compareRuns, formatField } from '../lib/demo/records';

export default function MarketingHome() {
  const baseline = demoRecords.runs.find(run => run.id === 'run-042')!;
  const target = demoRecords.runs.find(run => run.id === 'run-043')!;
  const comparison = compareRuns(demoRecords, baseline, target);
  const rows = comparison.rows.filter(row => ['hardware', 'firmware', 'calibration', 'model', 'lineage', 'gripForce'].includes(row.key));

  return <MarketingShell active="Home">
    <section className="m-hero m-wrap">
      <div className="m-hero-copy">
        <p className="m-kicker" data-hero>ROBOT CONFIGURATION HISTORY</p>
        <h1 data-hero>Know what changed.<br /><em>Keep the setup<br className="desktop-break" /> that worked.</em></h1>
        <p className="m-lead" data-hero>A record of the hardware, software, and calibration behind each test. Built for ROS 2 manipulation teams.</p>
        <div data-hero><Link className="m-button" href={localWorkspace ? '/workspace/' : '/demo/'}>{localWorkspace ? 'Open workspace' : 'Explore the working demo'} <span aria-hidden="true">↗</span></Link>
          <p className="m-small">{localWorkspace ? 'Local records. Save your work with JSON export.' : 'Synthetic records. Real comparison controls.'}</p></div>
      </div>
      <div className="m-hero-art" data-hero-art><div className="m-art-heading"><span>THE RECORDED SETUP</span><span>STUDY / 01</span></div><RecordSculpture /><p>Physical changes.<br /><em>Digital context.</em></p></div>
    </section>

    <section className="m-home-proof m-wrap" aria-labelledby="comparison-title">
      <div className="m-proof-copy" data-reveal><p className="m-kicker">01 / A CLEARER STARTING POINT</p><h2 id="comparison-title">Same robot.<br /><em>A different record.</em></h2><p>When a successful test starts failing, start with what changed. Bring recorded configurations together before deciding what to investigate.</p><p>A difference is a fact to investigate, not proof of a cause.</p><Link className="m-text-link" href="/services/run-comparison/">Inspect the working comparison <span aria-hidden="true">↗</span></Link></div>
      <div className="m-record-preview" data-reveal>
        <p className="m-record-caption">SYNTHETIC EXAMPLE <span>042 → 043</span></p>
        <div className="m-run-pair"><div><span>SUCCESSFUL RUN</span><strong>{baseline.successfulPicks} / {baseline.attemptedPicks}</strong><small>picks · {baseline.id}</small></div><div><span>FAILED RUN</span><strong>{target.successfulPicks} / {target.attemptedPicks}</strong><small>picks · {target.id}</small></div></div>
        <dl className="m-record-list">{rows.map(row => <div key={row.key}><dt>{row.label}<span>{row.result}{row.key === 'hardware' ? ' · Manually reported' : ''}</span></dt><dd><span><small>Before</small>{formatField(row.before)}</span><span><small>After</small>{formatField(row.after)}</span></dd></div>)}</dl>
        <p>Selected fields from exact snapshot revisions {baseline.snapshotRevision} and {target.snapshotRevision}. All records are invented; underlying evidence is unavailable. Missing values remain unknown.</p>
      </div>
    </section>

    <section className="m-home-services m-wrap" aria-labelledby="services-title">
      <div className="m-section-heading" data-reveal><p className="m-kicker">02 / SERVICES</p><h2 id="services-title">A record worth<br /><em>returning to.</em></h2><p>A focused workflow, from the configuration behind a test to the next question worth asking.</p></div>
      <div className="m-service-links"><EditorialLink href="/services/configuration-history/" number="01" title="Configuration history">Keep physical components and digital versions linked to an exact run.</EditorialLink><EditorialLink href="/services/run-comparison/" number="02" title="Run comparison">See recorded changes, missing evidence, and differences in test conditions.</EditorialLink><EditorialLink href="/services/pilot/" number="03" title="A focused pilot">Explore the proposed four-week pilot around one test workflow.</EditorialLink></div>
    </section>

    <section className="m-sector-band" aria-labelledby="sector-title"><div className="m-wrap m-sector-inner"><p className="m-kicker" data-reveal>03 / OUR INITIAL FOCUS</p><div data-reveal><h2 id="sector-title">Close to<br /><em>the test cell.</em></h2><p>For commercial teams developing robotic arms for picking, sorting, and machine tending. Where a gripper, a calibration, or a policy version can change between tests.</p><Link className="m-text-link" href="/sectors/robotic-manipulation/">Explore robotic manipulation <span aria-hidden="true">↗</span></Link><p className="m-small">Our intended audience. Customer deployments are not yet established.</p></div><div className="m-sector-index" aria-label="Initial applications"><span>01 <strong>Picking</strong></span><span>02 <strong>Sorting</strong></span><span>03 <strong>Machine tending</strong></span></div></div></section>

    <section className="m-invitation m-wrap" data-reveal><p className="m-kicker">04 / START A CONVERSATION</p><h2>A successful test.<br /><em>Then something changed.</em></h2><div><p>Tell us how your team found its way back through the record.</p><Link className="m-text-link" href="/about/#founders">Talk to the founders <span aria-hidden="true">↗</span></Link></div></section>
  </MarketingShell>;
}
