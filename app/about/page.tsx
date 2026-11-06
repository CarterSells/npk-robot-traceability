import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell, PageIntro } from '../marketing-shell';
import { readSiteConfig } from '../../lib/site-config.mjs';

export const metadata: Metadata = {
  title: 'About — Tavrik',
  description: 'Our mission, our goal, and a direct connection to the Tavrik founders.',
  alternates: { canonical: '/about/' },
};

export default function AboutPage() {
  const config = readSiteConfig();
  return <MarketingShell active="About">
    <PageIntro number="03" label="ABOUT Tavrik" title="Clarity before conclusions." text="We’re building a clearer history of robot development, starting with the configuration behind each test." />
    <div className="m-wrap m-content">
      <nav className="m-about-nav" aria-label="About sections">
        <a className="m-text-link" href="#mission">Our mission</a>
        <a className="m-text-link" href="#goal">Our goal</a>
        <a className="m-text-link" href="#founders">Contact the founders <span aria-hidden="true">↗</span></a>
      </nav>
      <section className="m-split" id="mission" aria-labelledby="mission-title">
        <div><p className="m-kicker">01 / WHY WE EXIST</p><h2 id="mission-title">Our mission</h2></div>
        <div><h3>Give every robot test the context it deserves.</h3><p>Our mission is to help robotics teams understand what changed between a successful test and a failure by connecting hardware, software, models, and calibration to a dependable engineering record.</p><p>We want engineers to spend less time reconstructing the past and more time deciding what to investigate next.</p></div>
      </section>
      <section className="m-split" id="goal" aria-labelledby="goal-title">
        <div><p className="m-kicker">02 / WHAT WE’RE WORKING TOWARD</p><h2 id="goal-title">Our goal</h2></div>
        <div><h3>Know what changed. Keep the setup that worked.</h3><p>Our goal is to make configuration history a useful part of everyday testing: record the setup, compare runs, and retain an exact reference to the configuration that succeeded.</p><p>We’re starting with commercial ROS 2 manipulation teams developing arms for picking, sorting, and machine tending. A comparison shows recorded differences and missing evidence; engineers decide what those differences mean.</p><p className="m-note">The local workspace and synthetic demo are implemented. Shared hosting and automated collection remain planned; customer outcomes are not yet validated.</p></div>
      </section>
      <section className="m-split" id="founders" aria-labelledby="founders-title">
        <div><p className="m-kicker">03 / LET’S TALK</p><h2 id="founders-title">Contact the founders</h2><p>Tavrik is founder-led. Talk directly with us about your team, your testing workflow, or a recent regression.</p></div>
        <div>{config.contactUrl ? <>
          <a className="m-button" href={config.contactUrl}>Email the founders <span aria-hidden="true">↗</span></a>
          <p className="m-small">Opens your email app or configured contact service. Nothing is sent automatically.</p>
          {config.contactUrl.startsWith('mailto:') && <div className="m-contact-addresses">{config.contactUrl.slice(7).split(',').map(email => <a key={email} href={'mailto:' + email}>{email}</a>)}</div>}
        </> : <p>Founder contact is not configured. This preview cannot accept inquiries.</p>}
          <p>A short, sanitized description is enough. Please keep credentials, code, private robot records, weights, datasets, and recordings out of your message.</p>
          <Link className="m-text-link" href="/security/">Security &amp; data handling <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </div>
  </MarketingShell>;
}
