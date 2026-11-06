import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell, PageIntro } from '../marketing-shell';
export const metadata: Metadata = { title: 'Tavrik — Synthetic walkthrough and supported inputs', description: 'Compare successful and failed robot tests, inspect recorded differences and understand supported metadata inputs.', alternates: { canonical: '/walkthrough/' } };
export default function WalkthroughPage() {
  return <MarketingShell active="Services"><PageIntro number="01.4" label="SYNTHETIC WALKTHROUGH" title="From a failed test to a clearer record." text="Follow an invented manipulation test. Inspect what changed, what is missing and what an engineer would investigate next." />
    <div className="m-wrap m-content">
      <section className="m-split"><div><h2>Try the comparison</h2><p>All records, authors and evidence identifiers in this example are invented. No customer outcome or time saving is demonstrated.</p><Link className="m-text-link" href="/demo/">Open the working demo ↗</Link></div><div><ol>
        <li>Open Robot 01 and select failed run-043. Choose successful run-042 as the baseline.</li>
        <li>Inspect six recorded differences: gripper, Git metadata, firmware, policy model, dataset version and calibration. Grip force remains unknown.</li>
        <li>Expand Selected record to inspect the exact revision, source and observation time. Hardware reports remain manual; synthetic evidence references are unavailable.</li>
        <li>Choose run-044 as baseline to see warnings about time, procedure and conditions. A successful result alone does not make a suitable baseline.</li>
        <li>Read Working setup reference. It preserves the earlier revision for an engineer to investigate. Missing values and artifacts prevent a claim that the setup can be restored.</li>
      </ol><p>Differences are facts to investigate, not automatic root-cause findings.</p></div></section>
      <section className="m-split"><div><h2>Supported inputs</h2><p>The local tools and private beta accept bounded metadata. This public demo does not accept uploads.</p></div><div>
        <h3>Manual records and JSON</h3><p>Robot identities, hardware reports, immutable snapshots, test outcomes and evidence references. Generic tests can use their actual measurements without invented pick counts.</p>
        <h3>Selected JSON and CSV fields</h3><p>Review discovered fields, labels, types and units, then reuse approved mappings. Unapproved new fields are not silently captured. CAD identities and revisions are references; geometry is not parsed.</p>
        <h3>Explicit collector sources</h3><p>Git commit and dirty status, model and calibration hashes, selected settings, timestamps and an operator hardware manifest. The base collector needs no ROS installation. The optional ROS 2 adapter is limited to one approved grip-force parameter.</p>
        <p>Raw source, model weights, datasets, recordings, CAD files and credentials are outside ingestion. Current workspaces are limited to 2 MiB and 1,000 entries per record collection.</p>
      </div></section>
      <section className="m-split"><div><h2>Continue the investigation</h2><p>The separate local workspace and private beta support notes, hypotheses, unresolved cases and engineer-confirmed resolutions with an evidence note or retest reference. Reports retain exact run and snapshot references.</p></div><div><h3>Know where work is saved</h3><p>Local drafts require JSON export before closing. In the private beta, Save to organization persists approved records; changes are not automatically saved. Hosted persistence, organization isolation and pilot measurements have been checked with synthetic data.</p><p>Customer access still awaits operational recovery and production checks. No billing, autonomous diagnosis or robot control is provided.</p><Link className="m-text-link" href="/security/">Read the data-handling status ↗</Link></div></section>
      <section className="m-split"><div><h2>Discuss a real regression</h2><p>The proposed four-week pilot covers one workflow and up to five robots. USD 1,000 is an unvalidated pricing hypothesis, subject to agreed scope.</p></div><div><p>Agree a baseline, an independent eligible-run count, support effort and success criteria. Actual customer adoption and willingness to pay remain unverified.</p><Link className="m-text-link" href="/services/pilot/">Read the proposed pilot ↗</Link><p><Link href="/about/#founders">Contact the founders</Link> with a sanitized description. Do not send private robot records or secrets.</p></div></section>
    </div>
  </MarketingShell>;
}
