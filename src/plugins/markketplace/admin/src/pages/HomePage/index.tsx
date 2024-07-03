/*
 *
 * HomePage
 *
 */
import pluginId from '../../pluginId';
import { Box } from '@strapi/design-system';
// https://design-system.strapi.io/?path=/docs/foundations-icons-icons--docs


const HomePage = () => {
  return (
    <Box>
      <h1 style={{ padding: '16px 8px' }}>
        Welcome to the {pluginId} plugin
      </h1>
      <p>
        This plugin incluces a few admin pages for our marketplace.
        <br />
        As well as some API Endpoints to perform transactions.
      </p>
    </Box>
  );
};

export default HomePage;
