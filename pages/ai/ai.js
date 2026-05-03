const { buildTutorPrompt, buildQuickTutorPrompt } = require('../../utils/ai-prompt');
const { requestAIReviewWithCache } = require('../../utils/ai-client');

const MODE_LABELS = {
  daily: '当日',
  weekly: '当周',
  overall: '整体'
};

const INSIGHTS_STORAGE_KEY = 'aiInsightsV2';

Page({
  data: {
    loading: false,
    currentReview: null,
    weekKey: '',
    todayKey: '',
    selectedMode: 'weekly',
    momentum: {
      completion: 0,
      totalHours: '0.0',
      targetHours: '0.0',
      streakDays: 0,
      levelTitle: '刚刚起步',
      message: '今天开始就是进步，先完成一条打卡。'
    },
    modes: [
      { key: 'daily', label: '当日分析' },
      { key: 'weekly', label: '当周分析' },
      { key: 'overall', label: '整体分析' }
    ]
  },

  onShow() {
    this.initDateKeys();
    this.refreshMomentum();
    this.loadCurrentAnalysis();
  },

  initDateKeys() {
    const today = new Date();
    const startOfWeek = this.getStartOfWeek(today);
    const weekKey = this.formatDate(startOfWeek);
    const todayKey = this.formatDate(today);
    this.setData({ weekKey, todayKey });
  },

  getStartOfWeek(date) {
    const target = new Date(date);
    const day = target.getDay();
    const diff = target.getDate() - day + (day === 0 ? -6 : 1);
    target.setDate(diff);
    return target;
  },

  loadCurrentAnalysis() {
    const mode = this.data.selectedMode;
    if (mode === 'weekly') {
      this.loadWeeklyReview();
      return;
    }
    this.loadV2Insight(mode);
  },

  loadWeeklyReview() {
    const reviews = wx.getStorageSync('reviews') || [];
    const currentReview = reviews.find((r) => r.weekStartDate === this.data.weekKey);
    if (currentReview) {
      this.setData({ currentReview: this.toDisplayReview(currentReview) });
      return;
    }
    this.setData({ currentReview: null });
  },

  loadV2Insight(mode) {
    const insights = wx.getStorageSync(INSIGHTS_STORAGE_KEY) || [];
    const { keyName, keyValue } = this.getInsightKeyInfo(mode);
    const matched = insights.find((item) => item.mode === mode && item[keyName] === keyValue);
    this.setData({ currentReview: matched ? this.toDisplayReview(matched) : null });
  },

  getInsightKeyInfo(mode) {
    if (mode === 'daily') {
      return { keyName: 'todayKey', keyValue: this.data.todayKey };
    }
    if (mode === 'overall') {
      return { keyName: 'todayKey', keyValue: this.data.todayKey };
    }
    return { keyName: 'weekKey', keyValue: this.data.weekKey };
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.selectedMode) return;
    this.setData({ selectedMode: mode, currentReview: null });
    this.loadCurrentAnalysis();
  },

  getLogsByMode(allLogs, mode) {
    const todayKey = this.data.todayKey;
    if (mode === 'daily') {
      return allLogs.filter((log) => log.date === todayKey);
    }
    if (mode === 'weekly') {
      return allLogs.filter((log) => log.date >= this.data.weekKey && log.date <= todayKey);
    }
    return allLogs;
  },

  getLogsForPrompt(logs, mode) {
    const sorted = logs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const limitMap = { daily: 8, weekly: 16, overall: 24 };
    const limited = sorted.slice(0, limitMap[mode] || 24);
    return limited.reverse();
  },

  getDifficultyLevel() {
    const now = new Date();
    return now.getMonth() + 1 >= 9 ? '高级难题' : '中级难度';
  },

  isResultQualified(parsedResult, desiredCount) {
    if (!parsedResult || typeof parsedResult.evaluation !== 'string' || !Array.isArray(parsedResult.quiz)) {
      return false;
    }
    if (parsedResult.quiz.length < desiredCount) return false;
    const evalText = parsedResult.evaluation;
    if (!evalText.includes('【7天执行建议】') || !evalText.includes('【本周侧重点】')) return false;
    for (let i = 0; i < desiredCount; i += 1) {
      const item = parsedResult.quiz[i] || {};
      const q = String(item.question || '').trim();
      const a = String(item.answer || '').trim();
      if (q.length < 18 || a.length < 28) return false;
    }
    return true;
  },

  buildSubjectAlignedQuiz(rawQuiz, subjects) {
    const difficultyLevel = this.getDifficultyLevel();
    const safeQuiz = Array.isArray(rawQuiz) ? rawQuiz : [];
    return subjects.slice(0, 4).map((subject) => {
      const matched = safeQuiz.find((q) => String(q.question || '').includes(subject.name));
      if (matched && matched.question && matched.answer) {
        return { question: String(matched.question), answer: String(matched.answer) };
      }
      const subjectType = this.getSubjectType(subject.name);
      return this.createFallbackQuizItem(subject.name, difficultyLevel, subjectType);
    });
  },

  buildProgressSummary(logs, mode) {
    const totalMinutes = logs.reduce((sum, item) => sum + (item.duration || 0), 0);
    if (mode === 'daily') {
      return `今日累计 ${totalMinutes} 分钟，约 ${(totalMinutes / 60).toFixed(1)} 小时。`;
    }

    const understandingAvg = logs.length
      ? (logs.reduce((sum, item) => sum + (item.understanding || 0), 0) / logs.length).toFixed(1)
      : '0.0';
    const subjectCount = new Set(logs.map((item) => item.subjectId)).size;
    return `累计 ${logs.length} 条打卡，覆盖 ${subjectCount} 科，合计 ${(totalMinutes / 60).toFixed(1)} 小时，平均掌握度 ${understandingAvg}/5。`;
  },

  buildOverallContext(logs, subjects) {
    const examDate = new Date('2026-12-19T00:00:00');
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)));
    const totalMinutes = logs.reduce((sum, item) => sum + (item.duration || 0), 0);
    const avgUnderstanding = logs.length
      ? (logs.reduce((sum, item) => sum + (item.understanding || 0), 0) / logs.length).toFixed(1)
      : '0.0';

    const subjectMap = {};
    logs.forEach((item) => {
      const subjectId = item.subjectId;
      if (!subjectMap[subjectId]) {
        subjectMap[subjectId] = { minutes: 0, count: 0, understandingTotal: 0 };
      }
      subjectMap[subjectId].minutes += item.duration || 0;
      subjectMap[subjectId].count += 1;
      subjectMap[subjectId].understandingTotal += item.understanding || 0;
    });

    const currentWeekLogs = logs.filter((log) => log.date >= this.data.weekKey && log.date <= this.data.todayKey);
    const weekMap = {};
    currentWeekLogs.forEach((item) => {
      if (!weekMap[item.subjectId]) weekMap[item.subjectId] = 0;
      weekMap[item.subjectId] += item.duration || 0;
    });

    const subjectSnapshot = subjects.map((subject) => {
      const stat = subjectMap[subject.id] || { minutes: 0, count: 0, understandingTotal: 0 };
      const hours = stat.minutes / 60;
      const avg = stat.count ? (stat.understandingTotal / stat.count).toFixed(1) : '0.0';
      const weekHours = (weekMap[subject.id] || 0) / 60;
      const targetHours = Number(subject.targetHoursPerWeek || 0);
      const targetCompletion = targetHours > 0 ? Math.min(100, (weekHours / targetHours) * 100).toFixed(0) : '0';
      return {
        name: subject.name,
        hours,
        avg,
        weekHours,
        targetHours,
        targetCompletion
      };
    });

    const weakestSubjects = subjectSnapshot
      .slice()
      .sort((a, b) => {
        if (Number(a.avg) !== Number(b.avg)) return Number(a.avg) - Number(b.avg);
        return a.hours - b.hours;
      })
      .slice(0, 2)
      .map((item) => `${item.name}(掌握度${item.avg}/5, 累计${item.hours.toFixed(1)}h)`)
      .join('；');

    const subjectStatsText = subjectSnapshot
      .map((item) => `${item.name}: 总${item.hours.toFixed(1)}h, 周${item.weekHours.toFixed(1)}h/目标${item.targetHours}h(${item.targetCompletion}%), 平均掌握度${item.avg}/5`)
      .join(' | ');

    const totalTarget = subjectSnapshot.reduce((sum, item) => sum + item.targetHours, 0);
    const allocationHint = subjectSnapshot
      .map((item) => {
        const percent = totalTarget > 0 ? ((item.targetHours / totalTarget) * 100).toFixed(0) : '0';
        return `${item.name}:${percent}%`;
      })
      .join('，');

    return `距考试 ${daysLeft} 天；累计学习 ${(totalMinutes / 60).toFixed(1)} 小时；整体平均掌握度 ${avgUnderstanding}/5。\n科目概览：${subjectStatsText}\n当前薄弱科目候选：${weakestSubjects || '暂无明显薄弱科目'}\n基于目标时长的建议占比参考：${allocationHint}`;
  },

  refreshMomentum() {
    const logs = wx.getStorageSync('logs') || [];
    const subjects = wx.getStorageSync('subjects') || [];
    const currentWeekLogs = logs.filter((log) => log.date >= this.data.weekKey && log.date <= this.data.todayKey);
    const weekMinutes = currentWeekLogs.reduce((sum, item) => sum + (item.duration || 0), 0);
    const targetHours = subjects.reduce((sum, item) => sum + Number(item.targetHoursPerWeek || 0), 0);
    const completion = targetHours > 0 ? Math.min(100, Math.round((weekMinutes / 60 / targetHours) * 100)) : 0;

    const streakDays = this.getConsecutiveDays(logs);
    let levelTitle = '稳步前进';
    let message = '节奏不错，继续保持这个学习惯性。';
    if (completion < 35) {
      levelTitle = '冲刺启动';
      message = '先完成今天计划，进度条会很快抬升。';
    } else if (completion >= 70 && completion < 100) {
      levelTitle = '高效推进';
      message = '已进入高效区间，重点攻克薄弱科目。';
    } else if (completion >= 100) {
      levelTitle = '本周达标';
      message = '你已达成本周目标，可以加练拔高题。';
    }

    this.setData({
      momentum: {
        completion,
        totalHours: (weekMinutes / 60).toFixed(1),
        targetHours: targetHours.toFixed(1),
        streakDays,
        levelTitle,
        message
      }
    });
  },

  getConsecutiveDays(logs) {
    if (!logs.length) return 0;
    const dateSet = new Set(logs.map((item) => item.date));
    let streak = 0;
    const cursor = new Date();
    while (true) {
      const key = this.formatDate(cursor);
      if (!dateSet.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  parseAllocationFromEvaluation(evaluation, subjects) {
    if (!evaluation) return [];
    const cleanText = String(evaluation).replace(/\\n/g, '\n');
    const regex = /([^\n，。；：:]+?)\s*[：:]\s*(\d{1,3})\s*%/g;
    const byName = {};
    let match = regex.exec(cleanText);
    while (match) {
      const rawName = match[1].trim();
      const percent = Number(match[2]);
      if (percent > 0 && percent <= 100) {
        byName[rawName] = percent;
      }
      match = regex.exec(cleanText);
    }

    const cards = subjects.map((subject) => {
      const alias = Object.keys(byName).find(
        (name) => name.includes(subject.name) || subject.name.includes(name)
      );
      if (!alias) return null;
      return {
        name: subject.name,
        percent: byName[alias],
        color: subject.color || '#8b5cf6'
      };
    }).filter(Boolean);

    const fallback = Object.keys(byName).map((name, index) => ({
      name,
      percent: byName[name],
      color: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'][index % 4]
    }));

    const list = cards.length ? cards : fallback;
    const total = list.reduce((sum, item) => sum + item.percent, 0);
    const normalized = total > 0
      ? list.map((item) => ({
          ...item,
          percent: Math.round((item.percent / total) * 100)
        }))
      : list;

    return normalized
      .sort((a, b) => b.percent - a.percent)
      .map((item) => ({
        ...item,
        width: Math.max(6, item.percent)
      }));
  },

  getSubjectType(name = '') {
    const n = String(name);
    if (n.includes('英语')) return 'english';
    if (n.includes('数学')) return 'math';
    if (n.includes('811') || n.includes('804') || n.includes('电路') || n.includes('传感器')) return 'major';
    if (n.includes('政治')) return 'politics';
    return 'generic';
  },

  extractKeywordsFromLogs(logs, limit = 4) {
    const text = logs.map((item) => String(item.content || '')).join(' ');
    const candidates = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 10);
    const stopWords = new Set(['今天', '复习', '内容', '练习', '完成', '进行', '学习', '以及', '然后', '因为', '所以', '这个', '那个']);
    const counter = {};
    candidates.forEach((word) => {
      if (stopWords.has(word)) return;
      counter[word] = (counter[word] || 0) + 1;
    });
    return Object.keys(counter)
      .sort((a, b) => counter[b] - counter[a])
      .slice(0, limit);
  },

  getPrioritizedLogsByUnderstanding(logs) {
    return logs
      .slice()
      .sort((a, b) => {
        const ua = Number(a.understanding || 0);
        const ub = Number(b.understanding || 0);
        if (ua !== ub) return ua - ub;
        return String(b.date).localeCompare(String(a.date));
      });
  },

  createFallbackQuizItem(subjectName, level, type, keywords = []) {
    const hotTopic = keywords.length ? `（优先围绕：${keywords.join(' / ')}）` : '';
    if (type === 'major') {
      return {
        question: `${level}题（${subjectName}）：
某二阶测量系统传递函数为 H(s)=25/(s^2+6s+25)，输入为单位阶跃。${hotTopic}请计算：
1) 阻尼比与无阻尼自然频率；
2) 峰值时间与超调量；
3) 若要求超调量不超过10%，应如何调整系统参数（写出方向即可）。`,
        answer: `解析要点：
1) 对比标准型 s^2+2ξωn s+ωn^2，得 ωn=5，ξ=6/(2*5)=0.6。
2) 峰值时间 tp=π/(ωn*sqrt(1-ξ^2))≈0.785s；超调量 Mp=exp(-ξπ/sqrt(1-ξ^2))≈9.5%。
3) 若需进一步降低超调，可提高阻尼比（如增加阻尼环节、优化反馈参数），同时兼顾响应速度。易错点是把 2ξωn 写错为 ξωn。`
      };
    }
    if (type === 'math') {
      return {
        question: `${level}题（${subjectName}）：
设 f(x)=x*e^x。${hotTopic}
1) 求 f'(x)、f''(x)；
2) 求曲线在 x=0 处切线方程；
3) 判断 x=0 是否为拐点并说明依据。`,
        answer: `解析要点：
1) f'(x)=e^x(1+x)，f''(x)=e^x(2+x)。
2) f(0)=0，f'(0)=1，切线为 y=x。
3) f''(0)=2>0，且在 0 附近符号不变，因此 x=0 不是拐点。判分点：导数计算、切线公式 y-y0=f'(x0)(x-x0)、拐点判定需“变号”。`
      };
    }
    if (type === 'english') {
      return {
        question: `${level}题（${subjectName}）：
请将下列句子翻译成中文并指出语法重点：${hotTopic}
"By the time the experiment was completed, the team had identified three major sources of measurement error."
再写出一句同结构英文句。`,
        answer: `解析要点：
译文：在实验完成时，该团队已经识别出三个主要的测量误差来源。
语法：By the time + 一般过去时，从句触发主句过去完成时（had done）。
仿写示例：By the time the report was submitted, we had revised the model twice。
易错点：把 had identified 误写成 identified。`
      };
    }
    if (type === 'politics') {
      return {
        question: `${level}题（${subjectName}）：
围绕“实践与认识的关系”写一段 120-150 字分析，要求包含：${hotTopic}
1) 基本观点；
2) 一个与你备考相关的例子；
3) 一句结论。`,
        answer: `解析要点：
观点：实践是认识的来源和检验标准，认识反作用于实践。
例子：通过阶段性套卷训练发现薄弱点，再反向调整章节复习，成绩提升。
结论：在备考中应坚持“做题-复盘-再实践”的闭环。判分点：观点准确、例子贴题、结论完整。`
      };
    }
    return {
      question: `${level}题（${subjectName}）：结合本周学习内容${hotTopic}，给出一个核心知识点并完成“定义-方法-例题-易错点”四步说明。`,
      answer: `解析要点：先写概念边界，再给标准解题流程，再做1个代表例题，最后总结易错点与自检清单。`
    };
  },

  buildLocalFallbackResult(logs, subjects, mode) {
    const desiredCount = 4;
    const prioritizedLogs = this.getPrioritizedLogsByUnderstanding(logs);
    const grouped = {};
    prioritizedLogs.forEach((log) => {
      if (!grouped[log.subjectId]) grouped[log.subjectId] = [];
      grouped[log.subjectId].push(log);
    });

    const subjectStats = Object.keys(grouped).map((subjectId) => {
      const arr = grouped[subjectId];
      const avg = arr.reduce((sum, item) => sum + (item.understanding || 0), 0) / arr.length;
      const totalHours = arr.reduce((sum, item) => sum + (item.duration || 0), 0) / 60;
      const subject = subjects.find((s) => s.id === subjectId) || { name: '未分类科目' };
      return { subjectId, name: subject.name, avg, totalHours };
    }).sort((a, b) => a.avg - b.avg);

    const weak = subjectStats[0];
    const focus = subjectStats[1] || weak;
    const topHours = subjectStats.reduce((sum, item) => sum + item.totalHours, 0).toFixed(1);
    const totalTarget = subjects.reduce((sum, item) => sum + Number(item.targetHoursPerWeek || 0), 0) || 1;
    const allocationLines = subjects.map((item) => {
      const pct = Math.round((Number(item.targetHoursPerWeek || 0) / totalTarget) * 100);
      return `${item.name}:${pct}%`;
    });

    const evaluation = [
      `【阶段判断】本次为${mode === 'daily' ? '当日' : mode === 'weekly' ? '当周' : '整体'}快速复盘（AI超时兜底版）。`,
      `【总体进度】当前记录合计约 ${topHours} 小时，建议先保证“做题量 + 复盘”双闭环。`,
      `【7天执行建议】`,
      `1) 每天固定 1 次计时训练（40-60 分钟），完成后立即订正并记录错因。`,
      `2) 每天安排 20 分钟回看当天错题，按“概念误差/计算失误/审题失误”分类。`,
      `【本周侧重点】`,
      `1) 优先补强：${weak ? weak.name : '薄弱科目'}（建议每天 +30~45 分钟）。`,
      `2) 次重点巩固：${focus ? focus.name : '核心科目'}（保持题感，防止回落）。`,
      `3) 每周至少完成 1 次综合小测并复盘评分点。`,
      `【本周时间分配建议】`,
      ...allocationLines
    ].join('\\n');

    const orderedSubjects = subjects.length ? subjects : [{ name: '政治' }, { name: '英语一' }, { name: '数学一' }, { name: '811电路/804传感器' }];
    const level = this.getDifficultyLevel();
    const quiz = orderedSubjects.slice(0, desiredCount).map((item) => {
      const subjectType = this.getSubjectType(item.name);
      const subjectLogs = prioritizedLogs.filter((log) => log.subjectId === item.id).slice(0, 6);
      const keywords = this.extractKeywordsFromLogs(subjectLogs, 3);
      return this.createFallbackQuizItem(item.name, level, subjectType, keywords);
    });

    return { evaluation, quiz };
  },

  getSourceMeta(sourceType) {
    const map = {
      ai: { text: 'AI生成', className: 'tag-ai' },
      quick: { text: '快速模式', className: 'tag-quick' },
      cache: { text: '缓存命中', className: 'tag-cache' },
      local: { text: '本地兜底', className: 'tag-local' }
    };
    return map[sourceType] || map.ai;
  },

  toDisplayReview(raw) {
    const subjects = wx.getStorageSync('subjects') || [];
    const quizList = Array.isArray(raw.quiz) ? raw.quiz : [];
    const allocationCards = this.parseAllocationFromEvaluation(raw.evaluation, subjects);
    const sourceMeta = this.getSourceMeta(raw.sourceType);
    return {
      ...raw,
      allocationCards,
      hasAllocation: allocationCards.length > 0,
      sourceText: sourceMeta.text,
      sourceClass: sourceMeta.className,
      evaluationHtml: this.formatRichText(raw.evaluation),
      quiz: quizList.map((q, index) => ({
        ...q,
        showAnswer: false,
        questionHtml: this.formatRichText(`Q${index + 1}. ${q.question || ''}`),
        answerHtml: this.formatRichText(`答：${q.answer || ''}`)
      }))
    };
  },

  persistInsight(mode, review) {
    if (mode === 'weekly') {
      const reviews = wx.getStorageSync('reviews') || [];
      const filteredReviews = reviews.filter((r) => r.weekStartDate !== this.data.weekKey);
      filteredReviews.push(review);
      wx.setStorageSync('reviews', filteredReviews);
      return;
    }

    const insights = wx.getStorageSync(INSIGHTS_STORAGE_KEY) || [];
    const { keyName, keyValue } = this.getInsightKeyInfo(mode);
    const filtered = insights.filter((item) => !(item.mode === mode && item[keyName] === keyValue));
    filtered.push(review);
    wx.setStorageSync(INSIGHTS_STORAGE_KEY, filtered);
  },

  generateReview() {
    this.generateReviewCore().catch((error) => {
      console.error('GenerateReview Unhandled Error:', error);
      wx.showToast({ title: '已自动降级，请稍后查看结果', icon: 'none', duration: 2200 });
      this.setData({ loading: false });
    });
  },

  async generateReviewCore() {
    this.setData({ loading: true });

    const logs = wx.getStorageSync('logs') || [];
    const subjects = wx.getStorageSync('subjects') || [];
    const mode = this.data.selectedMode;
    const currentLogs = this.getLogsByMode(logs, mode);
    const logsForPrompt = this.getLogsForPrompt(currentLogs, mode);

    if (currentLogs.length === 0) {
      wx.showToast({ title: `${MODE_LABELS[mode]}暂无打卡记录`, icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    const logSummary = logsForPrompt.map((log) => {
      const subject = subjects.find((s) => s.id === log.subjectId) || {};
      const briefContent = String(log.content || '').replace(/\s+/g, ' ').slice(0, 90);
      return `- ${log.date} [${subject.name}]: ${log.duration}分钟, 掌握度${log.understanding}/5, 内容: ${briefContent}`;
    }).join('\n');

    const progressSummary = this.buildProgressSummary(currentLogs, mode);
    const overallContext = this.buildOverallContext(logs, subjects);
    const requiredSubjects = subjects.map((s) => s.name).slice(0, 4);
    const difficultyLevel = this.getDifficultyLevel();
    const prompt = buildTutorPrompt({ mode, logSummary, progressSummary, overallContext, requiredSubjects, difficultyLevel });
    const fallbackPrompt = buildQuickTutorPrompt({ mode, logSummary, requiredSubjects, difficultyLevel });

    try {
      const { parsedResult, fromCache, fromFallback } = await requestAIReviewWithCache({
        weekKey: `${mode}:${this.data.weekKey}:${this.data.todayKey}`,
        logSummary,
        prompt,
        fallbackPrompt,
        requestOptions: {
          maxTokens: mode === 'daily' ? 900 : mode === 'weekly' ? 1100 : 1200,
          maxTotalMs: mode === 'daily' ? 25000 : mode === 'weekly' ? 30000 : 35000,
          modelCandidates: mode === 'daily'
            ? ['Qwen/Qwen2.5-72B-Instruct', 'Pro/deepseek-ai/DeepSeek-V3.2', 'Qwen/Qwen2.5-32B-Instruct', 'deepseek-ai/DeepSeek-V3']
            : mode === 'weekly'
              ? ['Pro/deepseek-ai/DeepSeek-V3.2', 'Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3']
              : ['Qwen/Qwen2.5-72B-Instruct', 'Pro/deepseek-ai/DeepSeek-V3.2']
        }
      });

      const desiredCount = 4;
      if (!this.isResultQualified(parsedResult, desiredCount)) {
        throw new Error('RESULT_NOT_QUALIFIED');
      }
      const quiz = this.buildSubjectAlignedQuiz(parsedResult.quiz, subjects);
      const baseReview = {
        id: Date.now().toString(),
        evaluation: parsedResult.evaluation || '',
        quiz,
        sourceType: fromCache ? 'cache' : fromFallback ? 'quick' : 'ai'
      };
      const newReview = mode === 'weekly'
        ? { ...baseReview, weekStartDate: this.data.weekKey }
        : {
            ...baseReview,
            mode,
            weekKey: this.data.weekKey,
            todayKey: this.data.todayKey
          };

      this.persistInsight(mode, newReview);
      this.refreshMomentum();

      this.setData({ currentReview: this.toDisplayReview(newReview) });
      const title = fromCache ? '读取缓存成功' : fromFallback ? '快速模式生成成功' : '生成成功';
      wx.showToast({ title, icon: 'success' });
    } catch (error) {
      console.error('AI Request Error:', error);
      const fallbackResult = this.buildLocalFallbackResult(currentLogs, subjects, mode);
      const desiredCount = 4;
      const quiz = this.buildSubjectAlignedQuiz(fallbackResult.quiz, subjects).slice(0, desiredCount);
      const baseReview = {
        id: Date.now().toString(),
        evaluation: fallbackResult.evaluation || '',
        quiz,
        sourceType: 'local'
      };
      const fallbackReview = mode === 'weekly'
        ? { ...baseReview, weekStartDate: this.data.weekKey }
        : {
            ...baseReview,
            mode,
            weekKey: this.data.weekKey,
            todayKey: this.data.todayKey
          };
      this.persistInsight(mode, fallbackReview);
      this.refreshMomentum();
      this.setData({ currentReview: this.toDisplayReview(fallbackReview) });
      const errText = `${(error && error.userMessage) || ''} ${(error && error.message) || ''}`;
      let reason = 'AI波动';
      if (/401|unauthorized/i.test(errText)) reason = '代理鉴权失败(401)';
      else if (/403/i.test(errText)) reason = '访问被拒绝(403)';
      else if (/url not in domain list/i.test(errText)) reason = '域名未加入白名单';
      else if (/timeout|超时/i.test(errText)) reason = '请求超时';
      else if (/500|upstream/i.test(errText)) reason = '代理上游异常';
      wx.showToast({ title: `${reason}，已用本地建议`, icon: 'none', duration: 2800 });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatRichText(text) {
    if (!text) return '';
    let html = String(text);
    // 处理 JSON 中可能出现的字面量 \n
    html = html.replace(/\\n/g, '\n');
    // 处理 Markdown 加粗 **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 处理 Markdown 斜体 *text*
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // 处理换行符为 <br/>
    html = html.replace(/\n/g, '<br/>');
    return html;
  },

  toggleAnswer(e) {
    const index = e.currentTarget.dataset.index;
    if (!this.data.currentReview || !this.data.currentReview.quiz[index]) return;
    const key = `currentReview.quiz[${index}].showAnswer`;
    this.setData({
      [key]: !this.data.currentReview.quiz[index].showAnswer
    });
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
})
