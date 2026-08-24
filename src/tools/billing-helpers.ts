import { ghlRequest } from "../client.js";

/**
 * GHL invoice/estimate creation requires a businessDetails block (with a phone number)
 * and a fuller contactDetails block than just an id. These helpers assemble both so the
 * tools only need a contactId. Business details come from env (set once) or per-call
 * overrides; contact details are fetched from the contact record.
 */

export interface BusinessOverrides {
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessWebsite?: string;
  businessLogoUrl?: string;
}

/** Cache of the location's business profile so we fetch it at most once per process. */
let locationProfileCache: Record<string, Record<string, unknown>> = {};

async function getLocationProfile(
  locationId: string,
): Promise<Record<string, unknown>> {
  if (locationProfileCache[locationId]) return locationProfileCache[locationId];
  const resp = await ghlRequest<{ location?: Record<string, unknown> }>(
    `/locations/${locationId}`,
  );
  const loc = resp.location ?? (resp as Record<string, unknown>) ?? {};
  locationProfileCache[locationId] = loc;
  return loc;
}

/**
 * Cache of the location's invoice settings (GET /invoices/settings). This is the same
 * source the GHL UI uses to pre-fill invoices/estimates: saved businessDetails (incl.
 * logoUrl), default terms & notes, titles, due-after-days, and number prefixes.
 */
let invoiceSettingsCache: Record<string, Record<string, unknown>> = {};

export async function getInvoiceSettings(
  locationId: string,
): Promise<Record<string, unknown>> {
  if (invoiceSettingsCache[locationId]) return invoiceSettingsCache[locationId];
  try {
    const resp = await ghlRequest<Record<string, unknown>>(
      `/invoices/settings?altId=${locationId}&altType=location`,
    );
    invoiceSettingsCache[locationId] = resp ?? {};
  } catch {
    // Settings are optional — fall back to the location profile if unavailable.
    invoiceSettingsCache[locationId] = {};
  }
  return invoiceSettingsCache[locationId];
}

/**
 * Build the businessDetails object GHL requires on invoices/estimates, matching what
 * the UI uses. Base = the saved invoice-settings businessDetails (includes logoUrl and
 * the exact business info configured for invoices). Per-call overrides and GHL_BUSINESS_*
 * env win over it; the location Business Profile is a last-resort fallback for name/phone.
 */
export async function buildBusinessDetails(
  o: BusinessOverrides,
  locationId: string,
): Promise<Record<string, unknown>> {
  const settings = await getInvoiceSettings(locationId);
  const saved = (settings.businessDetails as Record<string, unknown>) ?? {};

  let name = o.businessName ?? process.env.GHL_BUSINESS_NAME ?? (saved.name as string | undefined);
  let phoneNo =
    o.businessPhone ?? process.env.GHL_BUSINESS_PHONE ?? (saved.phoneNo as string | undefined);
  let website =
    o.businessWebsite ?? process.env.GHL_BUSINESS_WEBSITE ?? (saved.website as string | undefined);
  const logoUrl =
    o.businessLogoUrl ?? process.env.GHL_BUSINESS_LOGO_URL ?? (saved.logoUrl as string | undefined);
  const addressOverride = o.businessAddress ?? process.env.GHL_BUSINESS_ADDRESS;

  // GHL wants businessDetails.address as an object, not a string.
  let address: Record<string, unknown> | undefined = addressOverride
    ? { addressLine1: addressOverride }
    : (saved.address as Record<string, unknown> | undefined);

  if (!name || !phoneNo) {
    const loc = await getLocationProfile(locationId);
    name = name ?? (loc.name as string | undefined);
    phoneNo = phoneNo ?? (loc.phone as string | undefined);
    website = website ?? (loc.website as string | undefined);
    if (!address) {
      const a: Record<string, unknown> = {};
      if (loc.address) a.addressLine1 = loc.address;
      if (loc.city) a.city = loc.city;
      if (loc.state) a.state = loc.state;
      if (loc.postalCode) a.postalCode = loc.postalCode;
      if (loc.country) a.countryCode = loc.country;
      if (Object.keys(a).length) address = a;
    }
  }

  if (!name || !phoneNo) {
    throw new Error(
      "GHL requires a business name and phone on invoices/estimates, and none were found " +
        "in invoice settings or the location profile. Set GHL_BUSINESS_NAME and " +
        "GHL_BUSINESS_PHONE, or pass businessName/businessPhone.",
    );
  }

  const details: Record<string, unknown> = { name, phoneNo };
  if (address) details.address = address;
  if (website) details.website = website;
  if (logoUrl) details.logoUrl = logoUrl;
  if (Array.isArray(saved.customValues)) details.customValues = saved.customValues;
  return details;
}

export interface ContactOverrides {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * Fetch the contact and assemble the contactDetails block. Overrides win over the
 * fetched values. Throws an actionable error if the contact has no phone (GHL needs one).
 */
export async function buildContactDetails(
  contactId: string,
  o: ContactOverrides,
): Promise<Record<string, unknown>> {
  const resp = await ghlRequest<{ contact?: Record<string, unknown> }>(
    `/contacts/${contactId}`,
  );
  const c = resp.contact ?? {};

  const email = o.contactEmail ?? (c.email as string | undefined);
  const phoneNo = o.contactPhone ?? (c.phone as string | undefined);

  // GHL requires a non-empty contactDetails.name. Fall back through sensible options.
  const name =
    o.contactName ??
    (c.name as string | undefined) ??
    ([c.firstName, c.lastName].filter(Boolean).join(" ").trim() || undefined) ??
    (c.companyName as string | undefined) ??
    email ??
    phoneNo;

  if (!phoneNo) {
    throw new Error(
      `Contact ${contactId} has no phone number, which GHL requires on invoices/estimates. ` +
        "Add a phone to the contact, or pass contactPhone.",
    );
  }
  if (!name) {
    throw new Error(
      `Contact ${contactId} has no name/email to use for the invoice. Pass contactName.`,
    );
  }

  const details: Record<string, unknown> = { id: contactId, name, email, phoneNo };

  const address: Record<string, unknown> = {};
  if (c.address1) address.addressLine1 = c.address1;
  if (c.city) address.city = c.city;
  if (c.state) address.state = c.state;
  if (c.country) address.countryCode = c.country;
  if (c.postalCode) address.postalCode = c.postalCode;
  if (Object.keys(address).length) details.address = address;
  if (c.companyName) details.companyName = c.companyName;

  return details;
}

/** Today's date as YYYY-MM-DD (UTC). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Cache of a fallback sender user id per location. */
let senderUserCache: Record<string, string | undefined> = {};

/**
 * Resolve the user id GHL requires when sending an invoice/estimate (it needs `userId`
 * or `sentFrom`). Order: explicit arg → GHL_USER_ID env → first user on the location.
 * Throws an actionable error if none can be found.
 */
export async function resolveSenderUserId(
  explicit: string | undefined,
  locationId: string,
): Promise<string> {
  if (explicit) return explicit;
  if (process.env.GHL_USER_ID) return process.env.GHL_USER_ID;

  if (senderUserCache[locationId] === undefined) {
    try {
      const resp = await ghlRequest<{ users?: { id?: string }[] }>(
        `/users/?locationId=${locationId}`,
      );
      senderUserCache[locationId] = resp.users?.[0]?.id;
    } catch {
      senderUserCache[locationId] = undefined;
    }
  }

  const resolved = senderUserCache[locationId];
  if (!resolved) {
    throw new Error(
      "GHL requires a sending user (userId) to send an invoice/estimate, and none was " +
        "found. Set GHL_USER_ID in the server environment, or pass userId. Use " +
        "ghl_list_users to find a user id.",
    );
  }
  return resolved;
}
