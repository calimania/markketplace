/*
 *
 * Markketplace Plugin - Admin Homepage
 *
 */
import pluginId from '../../pluginId';
import { Typography, Box } from '@strapi/design-system';

// https://design-system.strapi.io/?path=/docs/foundations-icons-icons--docs
// https://docs.strapi.io/dev-docs/api/plugins/admin-panel-api
// https://strapi.io/blog/how-to-build-an-e-commerce-store-with-nuxt-js-and-strapi
// https://design-system-git-main-strapijs.vercel.app/?path=/docs/foundations-grid--docs
// https://docs.strapi.io/dev-docs/plugins/development/create-a-plugin
// https://docs.strapi.io/dev-docs/plugins/development/plugin-structure

const HomePage = () => {
  return (
    <Box>
      <Typography tag="h1" variant="h1" margin="0 0 16px 0">
        Welcome to the {pluginId} plugin - placeholder.
      </Typography>
      <Typography tag="p" variant="p" margin="0 0 16px 0">
        This plugin incluces a few admin pages for our marketplace.
      </Typography>
      <Typography tag="p" variant="p" margin="0 0 16px 0">
        Eventually we'll migrate functionality from the main project into the repo so we can share it with the community.
      </Typography>
    </Box>
  );
};

export default HomePage;
