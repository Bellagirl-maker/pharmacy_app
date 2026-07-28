import { createConsumer } from '@rails/actioncable';

// This connects directly to the 'mount ActionCable.server => "/cable"' route we set up in Rails
const cable = createConsumer('ws://localhost:3000/cable');

export default cable;