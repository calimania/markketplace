import { registerMiddleware } from './middlewares/encrypt-extensions';
import { registerMiddleware as registerPriceInventoryChanges } from './middlewares/price-inventory-changes';
import { registerEventReminderMiddleware, sendDueEventReminders } from './middlewares/event-reminders';
import { registerStoreVisibilityMiddleware } from './middlewares/store-visibility';

export default {
  register(/*{ strapi }*/) {
    console.log('[markket]:register');
  },

  bootstrap({ strapi }) {
    console.log('[markket]:bootstrap');
    registerMiddleware({ strapi });
    registerPriceInventoryChanges({ strapi });
    registerEventReminderMiddleware({ strapi });
    registerStoreVisibilityMiddleware({ strapi });

    // Run every 15 minutes: send any pending event reminders that are now due.
    strapi.cron.add({
      '*/15 * * * *': async () => {
        try {
          await sendDueEventReminders(strapi);
        } catch (err: any) {
          console.error('[EVENT_REMINDER_CRON] Unexpected error:', err.message);
        }
      },
    });
  },
};
