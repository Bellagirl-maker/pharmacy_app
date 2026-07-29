import { createConsumer } from '@rails/actioncable';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/cable';
const cable = createConsumer(WS_URL);

export default cable;