 ## Markketplace

![markketplace logo](https://markketplace.nyc3.digitaloceanspaces.com/uploads/1a82697eaeeb5b376d6983f452d1bf3d.png)

Welcome to Markket.place, a community to support businesses online & AFK.

This repo offers database structure & the admin dashboard for a server instance

Easy to use REST APIs, compatible with multiple free templates & hosting services

## Getting Started


1. **Clone the repository:**

```bash
git clone git@github.com:calimania/markketplace.git
```

Use docker-compose to build the local environment.

Use docker-compose to start the API and admin

```bash

docker-compose build markketplace
docker-compose up markketplace
```

## Docs

Find some documentation in markdown in the `docs` folder.

It will move into our website and online documentation.

[./docs](./docs/)

Announcement in our [Blog](https://www.markket. place/blog/2024-what-is-markketplace)

[markket.place](https://markket.place)

## Install dependencies:

Using `docker` and `docker-compose` to orchestrate.

This project runs a posgresdb, redis, strapi and storefront.

### Storefronts

The storefront comes from a different repo, a modified version of the medusa starter adapted to the
markketplace API.

Users can run other storefronts compatible with markketplace to control the appeareance of their stores.

Contributors are encouraged to keep the systems decoupled for better interoperability.

## Set up your environment:

Copy the .env.template file to a new file named .env and fill in your environment variables.

## Start the development server:

```bash

turbo dev
```

Visit in [localhost:1337](http://localhost:1337)

## Grow With Us

Markketplace is designed to support your growth at every stage. Start in our store and expand into your own instances, or grow alongside us. We are currently piloting with close friends and offering professional packages tailored to meet the needs of growing businesses.

## Security and Privacy by Design

At Markketplace, we prioritize security and privacy. Our platform is built with security and privacy by design, ensuring that your data and your customers' data are protected at every step of the way.

## Join Us

We are excited to welcome new users and collaborators to Markketplace. If you're interested in joining our pilot program or want to learn more about our professional packages, please reach out to us at hola[at]caliman.org.

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
