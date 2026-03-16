import express from 'express';
import { ChannelController } from '../controllers/ChannelController.js';

const router = express.Router();
const channelController = new ChannelController();

// Channel management
router.get('/', channelController.getChannels.bind(channelController));
router.get('/stats', channelController.getStats.bind(channelController));
router.get('/export', channelController.exportChannels.bind(channelController));
router.get('/:id', channelController.getChannel.bind(channelController));
router.put('/:id', channelController.updateChannel.bind(channelController));
router.delete('/:id', channelController.deleteChannel.bind(channelController));

export default router;