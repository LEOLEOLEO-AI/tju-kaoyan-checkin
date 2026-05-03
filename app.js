App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: true
      })
    } else {
      console.warn('当前基础库不支持云开发，AI辅导功能将不可用。')
    }

    // 初始化数据
    const logs = wx.getStorageSync('logs') || []
    const subjects = wx.getStorageSync('subjects') || [
      { id: '1', name: '政治', targetHoursPerWeek: 10, color: '#ef4444' },
      { id: '2', name: '英语一', targetHoursPerWeek: 12, color: '#3b82f6' },
      { id: '3', name: '数学一', targetHoursPerWeek: 20, color: '#10b981' },
      { id: '4', name: '811电路/804传感器', targetHoursPerWeek: 15, color: '#8b5cf6' }
    ]
    wx.setStorageSync('subjects', subjects)
  },
  onUnhandledRejection(res) {
    const reason = res && res.reason;
    const message = (reason && reason.message) || '';
    // 统一兜底 Promise 未捕获异常，避免开发环境弹出干扰性错误
    if (/timeout|超时/i.test(message)) {
      console.warn('捕获到未处理超时异常:', reason);
      return;
    }
    console.warn('捕获到未处理 Promise 异常:', reason || res);
  },
  onError(err) {
    if (/timeout|超时/i.test(String(err || ''))) {
      console.warn('全局错误捕获(超时):', err);
      return;
    }
    console.error('全局错误:', err);
  },
  globalData: {
    userInfo: null
  }
})
