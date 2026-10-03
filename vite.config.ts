import { defineConfig } from 'vite';

// configure-pages supplies the actual path, including root sites and custom domains.
const pagesPath = (process.env.VITE_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');
export default defineConfig({ base: pagesPath ? `/${pagesPath}/` : '/' });
