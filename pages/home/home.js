Page({
  data: {
    daysLeft: 0,
    weeksLeft: 0,
    totalHoursAllTime: '0.0',
    averageUnderstanding: '0.0',
    hoursToday: 0,
    minutesToday: 0,
    todayLogs: [],
    subjectStats: [],
    overallProgress: '0.0',
    gapFillingMsg: '暂无足够数据评估',
    gapFillingColor: '#6b7280',
    gapFillingBg: '#f3f4f6'
  },

  onShow() {
    this.calculateData();
  },

  calculateData() {
    const examDate = new Date('2026-12-19T00:00:00');
    const today = new Date();
    
    // Calculate days and weeks
    const diffTime = Math.abs(examDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    const diffWeeks = Math.floor(diffDays / 7);

    const logs = wx.getStorageSync('logs') || [];
    const subjects = wx.getStorageSync('subjects') || [];

    // Today's logs
    const todayStr = this.formatDate(today);
    const todayLogsRaw = logs.filter(log => log.date === todayStr);
    
    let totalMinutesToday = 0;
    const todayLogs = todayLogsRaw.map(log => {
      totalMinutesToday += log.duration;
      const subject = subjects.find(s => s.id === log.subjectId) || {};
      return {
        ...log,
        subjectName: subject.name,
        subjectColor: subject.color
      };
    });

    // All time stats & Subject stats
    let totalMinutesAllTime = 0;
    let totalUnderstanding = 0;
    
    const defaultTotalTargets = { '1': 300, '2': 400, '3': 600, '4': 500 };
    let totalTargetAll = 1800;
    let subjectStats = subjects.map(s => ({
      ...s,
      totalHours: 0,
      totalTarget: defaultTotalTargets[s.id] || 400
    }));

    let firstLogDate = new Date();

    logs.forEach(log => {
      totalMinutesAllTime += log.duration;
      totalUnderstanding += log.understanding;
      
      const logDate = new Date(log.date);
      if (logDate < firstLogDate) firstLogDate = logDate;

      const sStat = subjectStats.find(s => s.id === log.subjectId);
      if (sStat) sStat.totalHours += (log.duration / 60);
    });

    subjectStats = subjectStats.map(s => {
      let progress = (s.totalHours / s.totalTarget) * 100;
      if (progress > 100) progress = 100;
      return { ...s, progress: progress.toFixed(1), totalHours: s.totalHours.toFixed(1) };
    });

    const averageUnderstanding = logs.length > 0 
      ? (totalUnderstanding / logs.length).toFixed(1) 
      : '0.0';

    const overallProgress = Math.min((totalMinutesAllTime / 60) / totalTargetAll * 100, 100).toFixed(1);

    const daysSinceStart = Math.max(1, Math.ceil((today - firstLogDate) / (1000 * 60 * 60 * 24)));
    const paceHoursPerDay = (totalMinutesAllTime / 60) / daysSinceStart;
    
    let gapFillingMsg = "暂无足够数据评估";
    let gapFillingColor = "#6b7280";
    let gapFillingBg = "#f3f4f6";
    
    if (totalMinutesAllTime > 0) {
      const remainingHours = Math.max(0, totalTargetAll - (totalMinutesAllTime / 60));
      const daysToFinish = remainingHours / (paceHoursPerDay || 5);
      const finishDate = new Date(today.getTime() + daysToFinish * 24 * 60 * 60 * 1000);
      const gapDays = Math.floor((examDate - finishDate) / (1000 * 60 * 60 * 24));
      
      if (gapDays > 30) {
        gapFillingMsg = `预计提前完成，可预留 ${gapDays} 天查漏补缺`;
        gapFillingColor = "#10b981"; gapFillingBg = "#ecfdf5";
      } else if (gapDays >= 0) {
        gapFillingMsg = `进度正常，可预留 ${gapDays} 天查漏补缺`;
        gapFillingColor = "#3b82f6"; gapFillingBg = "#eff6ff";
      } else {
        gapFillingMsg = `进度落后，预计延期 ${Math.abs(gapDays)} 天，请增加时长！`;
        gapFillingColor = "#ef4444"; gapFillingBg = "#fef2f2";
      }
    }

    this.setData({
      daysLeft: diffDays,
      weeksLeft: diffWeeks,
      totalHoursAllTime: (totalMinutesAllTime / 60).toFixed(1),
      averageUnderstanding,
      hoursToday: Math.floor(totalMinutesToday / 60),
      minutesToday: totalMinutesToday % 60,
      todayLogs,
      subjectStats,
      overallProgress,
      gapFillingMsg,
      gapFillingColor,
      gapFillingBg
    });
  },

  clearData() {
    wx.showModal({
      title: '提示',
      content: '确定要清除所有打卡和AI评估记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('logs');
          wx.removeStorageSync('reviews');
          this.calculateData();
          wx.showToast({ title: '数据已清空', icon: 'success' });
        }
      }
    });
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
})
