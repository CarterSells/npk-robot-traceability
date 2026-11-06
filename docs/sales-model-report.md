# Tavrik sales model

Prepared October 12, 2026. Recommendation based on the current implementation, [business brief](../build.md) sections 2, 5, 7–9, and the official vendor pages linked below. Comparable sites demonstrate buying paths, not evidence that Tavrik's pricing or demand is validated.

**Tavrik should initially sell through founder-led demonstrations and scoped paid pilots. The website introduces the product and starts the conversation; a customer does not currently buy, sign in and start using a hosted workspace.**

## Current setup

The website contains a synthetic demonstration, founder contact links and a proposed USD 1,000 four-week pilot for one test procedure and up to five robots. That price is an unvalidated proposal. There is no checkout, payment integration, customer account system or hosted customer workspace. Public publication remains unverified. The software currently runs locally and requires explicit JSON export to retain records.

## What comparable sites do

| Company | Public buying path | Useful lesson for Tavrik |
| --- | --- | --- |
| [Foxglove](https://foxglove.dev/pricing) | Free signup, a published Pro plan with additional usage charges, and custom Enterprise pricing through contact with sales. | Combine an accessible demonstration with a sales conversation for more involved deployments. |
| [Formant](https://www.formant.ai/contact) | Contact/discovery asks about robot types, use case, deployment stage and decision timeline. | Qualify technical fit and the buying decision before proposing scope. |
| [Viam](https://www.viam.com/pricing) | Developer platform starts free and charges for cloud usage; packaged robotic solutions use tailored pricing and consultation. | The buying process can differ between a standard software product and an assisted deployment. |

These are adjacent robotics platforms with different scope; their prices are not direct benchmarks for Tavrik.

## Recommended customer journey

1. **Discover:** introductions, relevant communities and targeted conversations bring an engineer or engineering lead to the website. Show the concrete promise: compare the recorded setup of a successful test with a failed test.
2. **Evaluate:** let visitors explore the synthetic comparison and request a short discussion. Use “Discuss a pilot” as the sales action and “Explore the demo” as the product-preview action.
3. **Scope:** review one recent regression, supported metadata, custom parts/fields, data handling, setup effort, buyer and measurable success criteria.
4. **Agree and pay:** once delivery is ready and scope is agreed, use a pilot agreement and invoice or payment link. Test the proposed USD 1,000 fee with actual buyers. Payment processing would need to be configured; it is not implemented today.
5. **Onboard and evaluate:** help the team map approved metadata, capture tests and compare records. Measure reconstruction effort, coverage and independent use, then offer continued paid use if the results justify it. Discuss prospective renewal terms before the pilot starts; no renewal price is established.

## How customers receive the software

An early local evaluation would need a documented, supported installation on the customer's computer, with records retained locally. The current development server is not a finished customer distribution package.

A future hosted product could separate the public website from a private browser application: customers sign in to their organization's workspace, and a collector on their robot/development machine sends approved metadata. Accounts, persistent storage, authorization, organization isolation, authenticated ingestion and recovery must be implemented and verified before hosting customer records. Billing alone does not make that product ready.

**Recommended priority:** publish and verify the website/contact path, establish a repeatable pilot delivery process, and learn from actual buyers. Add self-service subscription checkout when onboarding and ongoing value have been demonstrated. This is a recommendation, not authorization to publish, send outreach or collect payment.
