# FHIR R5 subscriptions and device push

FHIR event delivery and device push solve different problems and have different lifecycles.

## 1. Register the application instance with DCR

Use RFC 7591 metadata to identify the software:

```json
{
  "application_type": "web",
  "software_id": "com.example.professional",
  "software_version": "2.4.0"
}
```

`software_id` identifies the product. The authorization server issues the
`client_id` for this registration. A browser session and a Web Push endpoint
are not client identifiers. Do not use a deployment environment field as an
identity dimension; the host/network URL already selects the environment.

## 2. Register the clinical event interest

`Subscription` is the FHIR R5 resource. `Batch` is not a FHIR resource name and
`_subscription` is not the operation.

- Tenant/application scope: `entity/org.hl7.fhir.r5/Subscription/_batch`
- One exact subject index: `individual/org.hl7.fhir.r5/Subscription/_batch`

The individual route requires a `filterBy` entry for `patient` or `subject`.
The tenant route may cover several hosted subjects, subject to authorization
and consent. The tenant/BFF owns the Subscription; a provider creates or
updates the clinical resource that matches its topic and filters.

GW CORE owns the neutral topic catalog through
`entity/org.hl7.fhir.r5/SubscriptionTopic/_batch`. The gateway accepts an HTTPS
`rest-hook`, validates filters against the active topic, stores the whole
Subscription encrypted, sends the standard handshake, and marks it `active`
only after that handshake succeeds.

## 3. Receive the FHIR notification

The rest-hook receives a FHIR R5 `Bundle` whose `type` is
`subscription-notification`. Its first resource is `SubscriptionStatus`; the
event focus references the resource that changed. This is distinct from a
Bundle of `Communication` resources delivered to the individual's index.

## 4. Fan out to devices

The BFF maps the clinical event to entitled users and their active Web Push,
APNs, or FCM endpoints. Push payloads should be opaque wake-up signals without
clinical data; the application reads authorized data after opening.

The target licensing model lets one professional seat own multiple devices. A
push endpoint can rotate without issuing a new seat or changing `software_id`.
A shared BFF wallet can use one client with several push endpoints; device-held
signing keys require a DCR registration per installation.

The gateway keeps `deviceId` as the legacy primary binding while storing a
`deviceBindings[]` registry. The default allowance is two active installations
per seat. A second portal/device therefore receives its own DCR `client_id` and
key set without consuming another professional/member seat or revoking the
first installation.

FHIR Subscription does not replace DCR, user licensing, consent, or the push endpoint registry.

GW CORE persists every matched notification before attempting delivery. Failed
HTTPS attempts become `retryable` with bounded scheduled exponential backoff;
later resource events also recover due attempts opportunistically. Production
must configure `FHIR_SUBSCRIPTION_ENDPOINT_HOSTS`; endpoints outside that
allowlist are rejected to prevent server-side request forgery.
