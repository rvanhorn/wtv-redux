import { styleText } from './styles/index.js';
import { createApplication } from './views/app/index.js';

const application = createApplication({ styleText });
application.start();
