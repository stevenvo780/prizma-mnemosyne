/**
 * Prizma integration for Mnemosyne (CRM, SSOT: crm_customer).
 *
 * Mnemosyne is the owner of CRM customer data, so the only event it is
 * authorised to *emit* into the Prizma ecosystem is CUSTOMER_UPDATE
 * (`customer.update`) — see ARCHITECTURE.md §4-5 (matriz SSOT: "Datos CRM
 * → dueño Mnemosyne, consume IRIS").
 *
 * The HubClient is fault-tolerant by design: a failed publish never throws
 * into business logic (connectors are optional, principle §2.2). Callers can
 * therefore `await hub.publishCustomerUpdate(...)` without try/catch and
 * without risking the local CRM sync flow.
 */
import { HubClient, EVENTS, validateEvent, type EventEnvelope } from '../vendor/prizma-contracts/index';

// Build opts conditionally: mnemosyne's tsconfig uses `exactOptionalPropertyTypes`,
// so we must NOT pass explicit `undefined` to optional fields (hubUrl/secret).
const hubOpts: { source: 'mnemosyne'; hubUrl?: string; secret?: string } = { source: 'mnemosyne' };
// Canonical env vars: NOUS_HUB_URL and NOUS_HUB_SECRET.
const hubUrl = process.env.NOUS_HUB_URL;
const hubSecret = process.env.NOUS_HUB_SECRET;
if (hubUrl) hubOpts.hubUrl = hubUrl;
if (hubSecret) hubOpts.secret = hubSecret;

/** Shared singleton client, tagged as the `mnemosyne` source. */
export const hub = new HubClient(hubOpts);

/** Minimal customer reference matching `prizma-contracts` CustomerRefSchema. */
export interface PrizmaCustomerRef {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * Publish a CRM customer change to Nous.
 *
 * Non-blocking / fault-tolerant: resolves to `false` on any transport error
 * instead of throwing. Call site should NOT wrap this in try/catch nor let it
 * gate the CRM write.
 *
 * @returns true if the hub accepted the event, false otherwise.
 */
export async function publishCustomerUpdate(customer: PrizmaCustomerRef): Promise<boolean> {
  // Drop empty/undefined keys so the payload validates cleanly.
  const cleaned: PrizmaCustomerRef = {};
  if (customer.id) cleaned.id = customer.id;
  if (customer.name) cleaned.name = customer.name;
  if (customer.phone) cleaned.phone = customer.phone;
  if (customer.email) cleaned.email = customer.email;

  return hub.publish(EVENTS.CUSTOMER_UPDATE, {
    customer: cleaned,
    source: 'mnemosyne',
  });
}

/** Re-exports so call sites only need to import from this module. */
export { HubClient, EVENTS, validateEvent };
export type { EventEnvelope };
