/**
 * Olympo integration for ApiSoftia (CRM, SSOT: crm_customer).
 *
 * ApiSoftia is the owner of CRM customer data, so the only event it is
 * authorised to *emit* into the Olympo ecosystem is CUSTOMER_UPDATE
 * (`customer.update`) — see ARCHITECTURE.md §4-5 (matriz SSOT: "Datos CRM
 * → dueño ApiSoftia, consume EMW").
 *
 * The HubClient is fault-tolerant by design: a failed publish never throws
 * into business logic (connectors are optional, principle §2.2). Callers can
 * therefore `await hub.publishCustomerUpdate(...)` without try/catch and
 * without risking the local CRM sync flow.
 */
import { HubClient, EVENTS, validateEvent, type EventEnvelope } from '@olympo/contracts';

// Build opts conditionally: apisoftia's tsconfig uses `exactOptionalPropertyTypes`,
// so we must NOT pass explicit `undefined` to optional fields (hubUrl/secret).
const hubOpts: { source: 'apisoftia'; hubUrl?: string; secret?: string } = { source: 'apisoftia' };
// Optional overrides via env; HubClient falls back to CAUCE_HUB_URL / localhost:3007.
if (process.env.CAUCE_HUB_URL) hubOpts.hubUrl = process.env.CAUCE_HUB_URL;
if (process.env.CAUCE_HUB_SECRET) hubOpts.secret = process.env.CAUCE_HUB_SECRET;

/** Shared singleton client, tagged as the `apisoftia` source. */
export const hub = new HubClient(hubOpts);

/** Minimal customer reference matching `@olympo/contracts` CustomerRefSchema. */
export interface OlympoCustomerRef {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * Publish a CRM customer change to HubCentral.
 *
 * Non-blocking / fault-tolerant: resolves to `false` on any transport error
 * instead of throwing. Call site should NOT wrap this in try/catch nor let it
 * gate the CRM write.
 *
 * @returns true if the hub accepted the event, false otherwise.
 */
export async function publishCustomerUpdate(customer: OlympoCustomerRef): Promise<boolean> {
  // Drop empty/undefined keys so the payload validates cleanly.
  const cleaned: OlympoCustomerRef = {};
  if (customer.id) cleaned.id = customer.id;
  if (customer.name) cleaned.name = customer.name;
  if (customer.phone) cleaned.phone = customer.phone;
  if (customer.email) cleaned.email = customer.email;

  return hub.publish(EVENTS.CUSTOMER_UPDATE, {
    customer: cleaned,
    source: 'apisoftia',
  });
}

/** Re-exports so call sites only need to import from this module. */
export { HubClient, EVENTS, validateEvent };
export type { EventEnvelope };
