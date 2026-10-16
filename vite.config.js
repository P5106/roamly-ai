import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  const port=env.PORT||process.env.PORT||5000;
  // Use 127.0.0.1 (IPv4) — "localhost" can resolve to ::1 on Windows/Node 17+, where the API isn't listening.
  return {plugins:[react()],server:{host:'0.0.0.0',proxy:{'/api':`http://127.0.0.1:${port}`}}};
});
