import { createApp } from 'vue';
import App from './App.js';
import { router } from './router/index.js';

const app = createApp(App);

app.use(router);
app.mount('#app');
