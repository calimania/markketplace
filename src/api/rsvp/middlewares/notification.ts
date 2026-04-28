import { sendRSVPNotification } from "../../markket/services/notification";

export default (config, { strapi }) => {
  return async (context, next) => {
    await next();

    const responseRsvp = context.body?.data;
    const rsvpDocumentId = responseRsvp?.documentId;

    if (!rsvpDocumentId) {
      return;
    }

    const rsvp = await strapi.documents('api::rsvp.rsvp').findOne({
      documentId: rsvpDocumentId,
      populate: ['event', 'event.stores', 'store', 'store.settings', 'store.Favicon', 'user'],
    });

    if (!rsvp?.email || !rsvp?.event) {
      return;
    }

    // Prefer the direct store relation; fall back to deriving from event.stores
    const store = rsvp.store || (Array.isArray(rsvp.event?.stores) ? rsvp.event.stores[0] : null);

    await sendRSVPNotification({ strapi, rsvp, event: rsvp.event, store });
  };
};