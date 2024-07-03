 Markketplace

![markketplace logo](https://github.com/calimania/markketplace/assets/1588753/e25b8673-69b3-4559-964c-922c7939acdf)

Welcome to Markketplace, a cutting-edge project built on top of Medusa, designed to revolutionize the way marketplaces are created and deployed.

Our platform offers a suite of marketplace components that are not only easy to deploy but also scalable to meet the needs of any community.

Whether you're starting from our store or planning to grow into your own instances, Markketplace is here to support your journey.

Create your own templates and storefronts to extend functionality and develop functionality unique to your needs.

## Getting Started

To get started with Markketplace, follow these simple steps:

1. **Clone the repository:**

```bash
git clone git@github.com:calimania/markketplace.git
```

## Docs

Find some documentation in markdown in the `docs` folder.

It will move into our website and online documentation.

[./docs](./docs/)

Announcement in our [Blog Post](https://caliman.org/2024/markketplace/)

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

```
docker-compose up -d local-server
```

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
npm run develop
# or
yarn develop
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
