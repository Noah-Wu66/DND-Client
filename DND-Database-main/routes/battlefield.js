const express = require('express');
const router = express.Router();
const Battlefield = require('../models/battlefield');

/**
 * @route   GET /api/v1/battlefield/sessions/:sessionId
 * @desc    获取战场会话数据
 * @access  Public
 */
router.get('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    let battlefield = await Battlefield.findOne({ sessionId });
    
    // 如果战场不存在，创建新战场
    if (!battlefield) {
      battlefield = new Battlefield({
        sessionId,
        backgroundImage: null,
        scale: 1.0,
        isGridVisible: true,
        pieceSize: 40,
        pieces: {}
      });
      await battlefield.save();
    }
    
    // 返回战场数据
    res.json({
      success: true,
      data: {
        sessionId: battlefield.sessionId,
        backgroundImage: battlefield.backgroundImage,
        scale: battlefield.scale,
        isGridVisible: battlefield.isGridVisible,
        pieceSize: battlefield.pieceSize,
        pieces: battlefield.pieces,
        lastUpdated: battlefield.lastUpdated
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/battlefield/sessions/:sessionId
 * @desc    保存战场会话数据
 * @access  Public
 */
router.post('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const battlefieldData = req.body;
    
    // 构建更新数据对象
    const updateData = {
      lastUpdated: Date.now()
    };
    
    // 更新背景图片
    if (battlefieldData.backgroundImage !== undefined) {
      updateData.backgroundImage = battlefieldData.backgroundImage;
    }
    
    // 更新缩放比例
    if (battlefieldData.scale !== undefined) {
      updateData.scale = battlefieldData.scale;
    }
    
    // 更新方格显示状态
    if (battlefieldData.isGridVisible !== undefined) {
      updateData.isGridVisible = battlefieldData.isGridVisible;
    }
    
    // 更新棋子大小
    if (battlefieldData.pieceSize !== undefined) {
      updateData.pieceSize = battlefieldData.pieceSize;
    }
    
    // 更新棋子位置
    if (battlefieldData.pieces !== undefined) {
      updateData.pieces = battlefieldData.pieces;
    }
    
    // 更新或创建战场
    const battlefield = await Battlefield.findOneAndUpdate(
      { sessionId },
      updateData,
      {
        new: true,
        upsert: true
      }
    );
    
    // 通过Socket.io通知其他客户端(在server.js中处理)
    req.app.get('io')?.to(sessionId).emit('battlefield-state-updated', {
      state: {
        backgroundImage: battlefield.backgroundImage,
        scale: battlefield.scale,
        isGridVisible: battlefield.isGridVisible,
        pieceSize: battlefield.pieceSize,
        pieces: battlefield.pieces
      }
    });
    
    res.json({
      success: true,
      data: {
        sessionId: battlefield.sessionId,
        lastUpdated: battlefield.lastUpdated
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/v1/battlefield/sessions/:sessionId
 * @desc    删除战场会话
 * @access  Public
 */
router.delete('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    const result = await Battlefield.deleteOne({ sessionId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '战场会话不存在'
      });
    }
    
    res.json({
      success: true,
      message: '战场会话已删除'
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/battlefield/sessions
 * @desc    获取所有战场会话的列表(仅用于管理目的)
 * @access  Public (可以增加授权保护)
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const battlefields = await Battlefield.find({}, 'sessionId lastUpdated createdAt')
      .sort({ lastUpdated: -1 })
      .limit(100);
    
    res.json({
      success: true,
      data: battlefields
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router; 