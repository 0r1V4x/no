export const ADMIN_CONTROLLED_COLLECTIONS = {
  videos: {
    collection: 'videos',
    fields: ['url', 'thumbnail', 'title', 'description', 'username', 'userId', 'likes', 'status', 'createdAt']
  },
  
  ads: {
    collection: 'ads',
    fields: ['type', 'unitId', 'frequency', 'reward', 'status', 'startDate', 'endDate']
  },
  
  withdrawalSettings: {
    collection: 'settings_withdrawal',
    fields: ['minAmount', 'maxAmount', 'dailyLimit', 'methods', 'status', 'processingTime']
  },
  
  earningRates: {
    collection: 'settings_earnings',
    fields: ['checkinRewards', 'spinRewards', 'videoRewards', 'referralBonus', 'coinToBdtRate']
  },
  
  users: {
    collection: 'users',
    adminEditableFields: ['balance', 'coins', 'status', 'isBlocked', 'blockReason', 'notes', 'role']
  },
  
  withdrawals: {
    collection: 'withdrawals',
    adminEditableFields: ['status', 'processedBy', 'processedAt', 'notes']
  },
  
  appConfig: {
    collection: 'app_config',
    fields: ['maintenanceMode', 'maintenanceMessage', 'forceUpdate', 'minVersion', 'latestVersion', 'announcement']
  },
  
  tasks: {
    collection: 'tasks',
    fields: ['title', 'description', 'reward', 'type', 'requirements', 'status', 'expiryDate', 'icon', 'createdAt']
  }
};
