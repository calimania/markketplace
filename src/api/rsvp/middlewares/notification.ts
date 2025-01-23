import { sendRSVPNotification } from "../../markket/services/notification";

export default (config, { strapi }) => {
  return async (context, next) => {
    await next();
    await sendRSVPNotification({ strapi, rsvp: context.body?.data, event: {} });
  };
};