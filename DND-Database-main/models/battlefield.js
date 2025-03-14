const mongoose = require('mongoose');

const BattlefieldSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  backgroundImage: {
    type: String,
    default: null
  },
  scale: {
    type: Number,
    default: 1.0
  },
  isGridVisible: {
    type: Boolean,
    default: true
  },
  pieceSize: {
    type: Number,
    default: 40
  },
  pieces: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 添加自动更新lastUpdated字段
BattlefieldSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

// 为更新操作添加自动更新lastUpdated字段
BattlefieldSchema.pre('findOneAndUpdate', function(next) {
  this.set({ lastUpdated: Date.now() });
  next();
});

module.exports = mongoose.model('Battlefield', BattlefieldSchema); 