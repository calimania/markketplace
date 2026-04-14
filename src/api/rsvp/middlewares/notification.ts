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
      populate: ['event', 'event.stores', 'event.stores.settings', 'event.stores.Favicon', 'user'],
    });

    if (!rsvp?.email || !rsvp?.event) {
      return;
    }

    await sendRSVPNotification({ strapi, rsvp, event: rsvp.event });
  };
};