## Features

### 2025

@NEXT:
- [ ] webhook transaction complete finds store for default orders
- [ ] Content type POST and social media scheduling
- [ ] Using and deployment an Astro [slug]  docs
- [ ] read existing tags in posts and displays in settings
- [ ] SocialPost content-type for a social feed
- [ ] Newsletter content-type and functionality
- [ ] Use sendgrid API to manage marketing lists (calendar, store, )
- [ ] Use Stripe API to better display information directly in dashboard
- [ ] Valkey caching
- [ ] User: verify new email for a store or login
- [ ] User: add email to account created with phone number

@OCTOBER:
- [ ] POST /markket/sms to send text to an user on a sms|whatsapp
- [ ] product schema, is digital, better stripe link creation
- [ ] orders decrease inventory amount
- [ ] Content type Review, for product reviews and comments in articles?
- [ ] Content type Appointment for digital product meeting?
- [ ] Content type Customer/Subscriber for managing CRM contacts
- [ ] SEO generate endpoint [product|page|article|store]
- [x] verify stripe webhook

@SEPTEMBER:
- [x] @strapi 5.24.2 upgrade
- [x] Read store.settings in public
- [x] STRIPE sync products|prices on save using middleware
- [x] Magic link via SMS, whatsapp & url shortner
- [x] Twilio incoming SMS webhook
- [x] URL Shortner content collection & controllers

@AUGUST:
- [x] POST markket/email
- [x] PUT store/settings
- [x] new design for homepage
- [x] album grid in homepage
- [x] new design for about us
- [x] new design for  products
- [x] new design for product[slug]
- [x] new design for pages
- [x] new design for pages[slug]
- [x] new design for blog
- [x] new design for blog[slug]
- [x] write types to cafecito
- [x] Yo Publi.co - Gazeta
- [x] Quendom record and website https://github.com/dvidsilva/queendom
- [x] Tigerlily Website
- [x] NextJS client in digital ocean ? https://github.com/leerob/next-self-host/blob/main/deploy.sh
- [x] astro dynamic pages
- [x] Login centralized to the API server?, connects to all the stores, redirects back with a secrets
- [x] Profile page for store fronts, posts, promotions, articles, events,
- [x] strapi / astro sitemap review?
- [x] start nextjs registration pages, allow people to launch store/sites and start adding content
- [x] create nice library in nextjs to access content like the cotnent layer? from scratch
- [x] Use ASTRO API endpoints
- [x] Astro, fix Meta.Title and SEO
- [x] Product lists and pages from API
- [x] Start working in NextJS dashboards
- [x] After functionality is proven in markket.place & morir soñando -start migrationg to NextJS and libraries
- [x] Design system: https://design-system.strapi.io/?
- [x] Block STRIPE_CUSTOMER_ID: null, from Store endpoint
- [x] BUG: Categories and users show up in selectors indiscrimnately
- [x] Fix middleware - use populate in .astro
- [x] Use workspaces to publish types and utilities https://docs.npmjs.com/cli/v8/using-npm/workspaces
- [x] Swagger UI https://docs.strapi.io/dev-docs/plugins/documentation
- [x] Add instagram API https://developers.facebook.com/docs/instagram-basic-display-api/getting-started/
- [x] Create Content Type Event & Calendar & RSVP
- [x] Customer resources can go on their own APP ?
- [x] Customers can input their own digital ocean keys


### 2024

@NOV 4:
- [x] Additional markketplace deployment for dvidsilva

@OCTOBER 28:
- [x] Fix type definitions across
- [x] Tags page
- [x] Create Content Type Page - different from article in the way that is used by the client
- [x] Add sendgrid API key to Digital Ocean before deploy
- [x] Recreate mdx posts in admin
- [x] Read homepage and about me page from markket.api
- [x] Integrate the content layer in the markket.place - astro and remove duplicated posts
- [x] BUG: category slug can repeat across stores
- [x] PAGE.slug doesnt need to be unique
- [x] Read pages dynamically
- [x] Read blogs dynamically
