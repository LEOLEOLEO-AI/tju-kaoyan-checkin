Page({
  data: {
    subjects: [],
    subjectId: '1',
    duration: '60',
    content: '',
    understanding: 3
  },

  onShow() {
    const subjects = wx.getStorageSync('subjects') || [];
    if (subjects.length > 0) {
      const subjectId = this.data.subjectId || subjects[0].id;
      this.setData({ 
        subjects,
        subjectId
      });
      this.loadTodayLog(subjectId);
    }
  },

  selectSubject(e) {
    const subjectId = e.currentTarget.dataset.id;
    this.setData({ subjectId });
    this.loadTodayLog(subjectId);
  },

  loadTodayLog(subjectId) {
    const logs = wx.getStorageSync('logs') || [];
    const todayStr = this.formatDate(new Date());
    const existingLog = logs.find(l => l.date === todayStr && l.subjectId === subjectId);

    if (existingLog) {
      this.setData({
        duration: existingLog.duration.toString(),
        content: existingLog.content,
        understanding: existingLog.understanding
      });
    } else {
      this.setData({
        duration: '60',
        content: '',
        understanding: 3
      });
    }
  },

  inputDuration(e) {
    this.setData({ duration: e.detail.value });
  },

  inputContent(e) {
    this.setData({ content: e.detail.value });
  },

  selectLevel(e) {
    this.setData({ understanding: e.currentTarget.dataset.level });
  },

  submitLog() {
    const { subjectId, duration, content, understanding } = this.data;
    
    if (!content.trim()) {
      wx.showToast({ title: '请输入复习内容', icon: 'none' });
      return;
    }

    const logs = wx.getStorageSync('logs') || [];
    const todayStr = this.formatDate(new Date());
    const existingIndex = logs.findIndex(l => l.date === todayStr && l.subjectId === subjectId);
    
    if (existingIndex > -1) {
      // Update existing log
      logs[existingIndex].duration = parseInt(duration, 10);
      logs[existingIndex].content = content;
      logs[existingIndex].understanding = understanding;
    } else {
      // Create new log
      const newLog = {
        id: Date.now().toString(),
        date: todayStr,
        subjectId,
        duration: parseInt(duration, 10),
        content,
        understanding
      };
      logs.push(newLog);
    }

    wx.setStorageSync('logs', logs);
    wx.showToast({ title: '打卡成功', icon: 'success' });
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
})
