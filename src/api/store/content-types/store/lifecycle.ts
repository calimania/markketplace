// Drafting lifecycle hooks in typescript
// import * as UID from "@strapi/types/dist/uid";
// import { Event, Params } from "@strapi/database/dist/lifecycles";
// import * as AttributeUtils from "@strapi/types/dist/modules/documents/params/attributes";

// type LifecycleEvent<T extends UID.Schema> = Omit<Event, "result" | "params"> & {
//     result?: AttributeUtils.GetValues<T>;
//     params: Omit<Params, "data"> & {
//         data: Omit<
//             AttributeUtils.GetValues<T>,
//             "id" | "documentId" | "localizations" | "locale"
//         >;
//     };
// };
// type TypedEvent = LifecycleEvent<"admin::user">; //change this

// export default {
//     async beforeCreate(event: TypedEvent) {
//         // event.params is typed here
//     },
//     async afterCreate(event: TypedEvent) {
//         // event.result is typed here
//     },
// };

// import { type Event } from '@strapi/database/dist/lifecycles';


// const MAX_STORES_PER_USER = 2;
// const MODEL_ID = 'api::store.store';

// export default {
//   async beforeCreate(event: Event) {
//     const { data } = event.params;
//     const { user } = event.state;

//     if (!user) {
//       throw new Error('User not authenticated');
//     }

//     try {
//       // Check store count
//       const { count: userStores } = await strapi.entityService.count(MODEL_ID, {
//         filters: {
//           users: {
//             id: user.id,
//           },
//         },
//       });

//       if (userStores >= MAX_STORES_PER_USER) {
//         throw new Error(
//           `Users are limited to ${MAX_STORES_PER_USER} store. Please contact support for more information.`
//         );
//       }

//       // Ensure users array exists and add current user
//       if (!data.users) {
//         data.users = [];
//       }

//       if (!data.users.includes(user.id)) {
//         data.users.push(user.id);
//       }
//     } catch (error) {
//       console.error('Error in store lifecycle hook:', error);
//       throw error;
//     }
//   },

//   async afterCreate(event: Event) {
//     const { result } = event;
//     const { user } = event.state;

//     try {
//       // Log store creation in markket service
//       await strapi.service('api::markket.markket').create({
//         data: {
//           Key: 'store.created',
//           Content: {
//             storeId: result.id,
//             storeName: result.title,
//             createdBy: user?.id,
//             timestamp: new Date().toISOString()
//           },
//           user_key_or_id: user?.id?.toString() || '',
//           locale: 'en'
//         }
//       });

//       console.log(`Store created: ${result.title} by user ${user?.id}`);
//     } catch (error) {
//       // Log error but don't block store creation
//       console.error('Error logging store creation:', error);
//     }
//   }
// };
