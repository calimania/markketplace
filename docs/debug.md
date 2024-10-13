# Debugging

Common useful commands to get out of situations.

## Missing content types

Error examples:

```bash

ERROR in ./src/api/subscriber/services/subscriber.ts:7:44
TS2345: Argument of type '"api::subscriber.subscriber"' is not assignable to parameter of type 'ContentType'.
    5 | import { factories } from '@strapi/strapi';
    6 |
  > 7 | export default factories.createCoreService('api::subscriber.subscriber');

```

Possible Solution:

```bash

## Run a strapi typescript command to regenerate

 yarn strapi ts:generate-types

 ```
