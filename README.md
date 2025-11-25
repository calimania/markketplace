 ## Markkët API

![markketplace logo](https://markketplace.nyc3.digitaloceanspaces.com/uploads/1a82697eaeeb5b376d6983f452d1bf3d.png)

Welcome to Markket.place, webmaster community powered by Strapi

This repo offers database structure & the admin dashboard for a server instance

Easy to use REST APIs, compatible with multiple free templates & hosting services

## Cloud

[de.markket.place] create an account to access a store owner dashboard and access API features

## Getting Started

### Comprehensive API documentation

```bash
npm run api:docs
```

#### Interactive testing helper

```bash
npm run api:test
```

### Local development

Use this project to manage your own markket instance, provide your own credentials
and exercise full control over your data and community experience

To create a regular account visit [ de.markket.plac ](https://de.markket.place/auth/magic)

For agencies or large communities with multiple initiatives, controlling your own instance makes it possible to
customize roles, access and availability of features for distributed teams of any size

### Self hosting

We host in digital ocean, using the app features and managed database. With their free trial and a few clicks you can have a full
admin dashboard for your own community

This repo should be compatible with any cloud provider, see strapi deployment tutorials for best practices

### Strapi Cloud

Strapi Cloud now offers a free tier where it would be easy to deploy this project, to familiarize
yourself or support small agencies or communities

Quickly test in [strapi cloud free tier](https://strapi.io/blog/introducing-the-free-plan-for-strapi-cloud)

### Local
Welcome to Markkëtplace — an open, extensible, and community-driven commerce platform. Our mission is to empower anyone to create, run, and extend their own marketplace, whether online, offline, or at the edge.

**Why Markkëtplace?**
- **Open Community:** We welcome contributors, users, and integrators from all backgrounds. Our goal is to build a platform that serves real-world needs, from local events to global e-commerce.
- **Extensible by Design:** Easily add new features, payment methods, or integrations via plugins and extensions. Propose or adopt standards as the project evolves.
- **Data Portability:** Your data is yours. Import, export, and migrate with ease. We encourage adapters for other systems and formats.
- **Offline & Edge Ready:** Markkëtplace can run on localhost, in the cloud, or at the edge. Register cash payments, sell tickets for a school play, or operate in low-connectivity environments.
- **Not Just for Profit:** This platform is for everyone — from small businesses to community groups, schools, and non-profits.

> "A school play can use Markkëtplace to sell tickets, take cash payments, and register them on a local server — no internet required."

---


Easy to use REST APIs, compatible with multiple free templates & hosting services. See our [CONTRIBUTING.md](./CONTRIBUTING.md) for how to build your own extension or adapter.

```bash
git clone git@github.com:calimania/markketplace.git
```

Use docker-compose to build the local environment.

Use docker-compose to start the API and admin

```bash

docker-compose build markketplace
docker-compose up markketplace
```


### Self Host

Deploy to any cloud prodvider like digital ocean

[ Deploying Strapi in Digital Ocean ](https://strapi.io/integrations/digital-ocean)

Review `.env.example` for ENV names for PostgresQL and essential services

The initial user becomes super admin in your instance

## 🤝 Philosophy & Standards

Markkëtplace is committed to open standards, data portability, and community-driven development. We encourage:
- Proposals for new features, standards, and extensions
- Adapters for other platforms and data formats
- Offline and edge use cases
- Contributions from all backgrounds

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get involved, propose a standard, or build an extension.

---

Find some documentation in markdown in the `docs` folder.

It will move into our website and online documentation.

[./docs](./docs/)

Announcement in our [Blog](https://www.markket. place/blog/2024-what-is-markketplace)

[markket.place](https://markket.place)

## Install dependencies:

Using `docker` and `docker-compose` to orchestrate.

This project runs a posgresdb, redis, strapi and storefront.

### Storefronts

Find templates compatible with astro, or create your own using our strapi-loader

[ github markketplace astro ](https://github.com/calimania/markketplace-astro)

[ npm install cafecito ](https://www.npmjs.com/package/cafecito)


## Set up your environment:

Copy the .env.template file to a new file named .env and fill in your environment variables.

## Start the development server:

```bash

turbo dev
```

Visit in [localhost:1337](http://localhost:1337)


# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
yarn develop
# or
npm run develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn startc
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

## Email

Configured by default to use the sendgrid integration. Include your SENDGRID_API_KEY and email to enable.

## SMS & Webhooks

SMS integration via Twilio webhooks is available at `/api/markket/twilio-sms`. Include your `TWILIO_AUTH_TOKEN` to enable signature verification and secure processing of incoming text messages.


## 📱 SMS Integration & Text-to-Action

Markketplace now supports SMS webhooks through Twilio integration, enabling text-based interactions with your markket instance.

### Current Features

- **Secure SMS Webhooks**: `POST /api/markket/twilio-sms`
- **Signature Verification**: Only processes verified Twilio webhooks
- **Auto-Response**: Branded TwiML responses to incoming texts
- **Activity Logging**: All legitimate SMS interactions are logged

### Setup

1. Configure your Twilio phone number webhook URL:
   ```
   https://yourdomain.com/api/markket/twilio-sms
   ```

2. Add your Twilio Auth Token to environment:
   ```bash
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   ```

3. Users texting your number receive:
   ```
   markkët! 💜 Learn more https://de.markket.place
   ```

### 🔮 Coming Soon: Text-to-Action Processing

Future releases will include intelligent text processing to enable markket actions via SMS:

- **Product Inquiries**: Text product names to get details and purchase links
- **Order Status**: Check order status by texting order IDs
- **Store Discovery**: Find stores by category or location via text
- **Quick Orders**: Simple text commands for repeat purchases
- **Event RSVPs**: Respond to event invitations via SMS
- **Customer Support**: Automated routing to appropriate store owners

**Example Future Interactions:**

```
User: "order status"
→ Retrieves information about orders associated with number and link to view details

User: "order #12345 status"
→ Returns current shipping status and tracking info for specific order

User: "events near brooklyn"
→ Lists upcoming events in Brooklyn area
```

This creates a conversational commerce experience where customers can interact with your entire marketplace ecosystem through simple text messages.


## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
