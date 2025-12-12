
## Local Development

To initialize a local development environment for SuperSplat, ensure you have [Node.js](https://nodejs.org/) 18 or later installed. Follow these steps:


1. Install dependencies:

   ```sh
   npm install
   ```

2. Build Splat Viewer and start a local web server:

   ```sh
   npm run dev-all
   ```

3. Open a web browser tab and make sure network caching is disabled on the network tab and the other application caches are clear:

   - On Safari you can use `Cmd+Option+e` or Develop->Empty Caches.
   - On Chrome ensure the options "Update on reload" and "Bypass for network" are enabled in the Application->Service workers tab:


4. Navigate to `http://localhost:8081`

When changes to the source are detected, Splat Player is rebuilt automatically. Simply refresh your browser to see your changes.


