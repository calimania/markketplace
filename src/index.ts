import { registerMiddleware } from './middlewares/encrypt-extensions';
import { registerMiddleware as registerPriceInventoryChanges } from './middlewares/price-inventory-changes';
import { registerEventReminderMiddleware, sendDueEventReminders } from './middlewares/event-reminders';
import { registerStoreVisibilityMiddleware } from './middlewares/store-visibility';

export default {
  register(/*{ strapi }*/) {
    console.log('[markket]:register');
  },

  bootstrap({ strapi }) {
    if (process.argv.includes('ts:generate-types')) {
      console.log('[markket]: Skipping bootstrap for type generation');
      return;
    }

    console.log('[markket]:bootstrap');
    registerMiddleware({ strapi });
    registerPriceInventoryChanges({ strapi });
    registerEventReminderMiddleware({ strapi });
    registerStoreVisibilityMiddleware({ strapi });

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