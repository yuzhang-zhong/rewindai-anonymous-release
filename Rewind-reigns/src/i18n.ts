import type { Direction, Language, ResourceKey } from "./types";

export const text = {
  en: {
    appTitle: "simulation-test",
    nameLabel: "Player name",
    namePlaceholder: "Enter your campus name",
    start: "Start semester",
    continueTitle: "Campus decision run",
    language: "Language",
    startGuideTitle: "How to use this test",
    startGuidePlay: "Start a semester and make campus choices from the public random deck.",
    startGuideRecords: "After the run ends, open Records to review choices, outcomes, and failure categories.",
    startGuideReflect: "Then use Reflect / AI Reflect / Clone before replaying.",
    recordsLocked: "Records unlock after your first run.",
    advisorLocked: "Reflection unlocks after a saved run.",
    records: "Records",
    runReport: "Run report",
    viewRunReport: "View run report",
    runEnded: "Run ended",
    decisionsBeforeEnding: "Decisions before ending",
    endingCause: "Ending cause",
    finalMeters: "Final meters",
    decisionTrail: "Decision trail",
    card: "Card",
    choice: "Choice",
    before: "Before",
    after: "After",
    tags: "Tags",
    risk: "Risk",
    category: "Category",
    close: "Close",
    continueToReflection: "Continue",
    reportNextStep: "This report is saved. Press Continue to reflect, replay, or return to RewindAI.",
    newSemester: "New semester",
    campusWeeks: "campus weeks",
    week: "Week",
    term: "Term",
    runStatus: "Run status",
    decisionsMade: "Decisions",
    queuedLinks: "Linked events",
    dangerMeters: "Meters in danger",
    noRecords: "No saved runs yet.",
    initial: "Initial setup",
    trajectory: "Trajectory",
    finalState: "Current state",
    startedAt: "Started",
    updatedAt: "Updated",
    firstCard: "First card",
    totalCards: "Total cards",
    decisions: "decisions",
    chooseRecord: "Open saved run",
    resources: "Resources",
    outcome: "Outcome",
    directionNames: {
      left: "Left",
      right: "Right",
      up: "Up",
      down: "Down"
    },
    resourceLabels: {
      faith: "GPA",
      people: "Friends",
      military: "Energy",
      wealth: "Budget"
    }
  },
  zh: {
    appTitle: "simulation-test",
    nameLabel: "用户名",
    namePlaceholder: "输入你的校园用户名",
    start: "开始学期",
    continueTitle: "校园决策模拟",
    language: "语言",
    startGuideTitle: "怎么使用这个测试",
    startGuidePlay: "先开始一个学期，从公共随机校园题库里做选择。",
    startGuideRecords: "本局结束后，打开记录查看选择、结果和失败类别。",
    startGuideReflect: "然后进行自我反思 / 通用反思 / Clone 反思，再重玩一次。",
    recordsLocked: "完成第一局后解锁记录。",
    advisorLocked: "保存一局后解锁反思。",
    records: "记录",
    runReport: "本局报告",
    viewRunReport: "查看本局报告",
    runEnded: "本局结束",
    decisionsBeforeEnding: "结束前决策数",
    endingCause: "结束原因",
    finalMeters: "最终资源",
    decisionTrail: "决策轨迹",
    card: "卡片",
    choice: "选择",
    before: "之前",
    after: "之后",
    tags: "标签",
    risk: "风险",
    category: "类别",
    close: "关闭",
    continueToReflection: "继续",
    reportNextStep: "这份报告已保存。点击“继续”后可以反思、重玩，或回到 RewindAI 查看回流记录。",
    newSemester: "新学期",
    campusWeeks: "校园周数",
    week: "第",
    term: "轮次",
    runStatus: "本局状态",
    decisionsMade: "已决策",
    queuedLinks: "关联事件",
    dangerMeters: "危险资源",
    noRecords: "还没有保存的记录。",
    initial: "初始化内容",
    trajectory: "轨迹记录",
    finalState: "当前状态",
    startedAt: "开始时间",
    updatedAt: "更新时间",
    firstCard: "首张卡片",
    totalCards: "题库总数",
    decisions: "次决策",
    chooseRecord: "打开记录",
    resources: "资源",
    outcome: "结果",
    directionNames: {
      left: "左",
      right: "右",
      up: "上",
      down: "下"
    },
    resourceLabels: {
      faith: "GPA",
      people: "朋友",
      military: "精力",
      wealth: "预算"
    }
  }
} satisfies Record<Language, {
  appTitle: string;
  nameLabel: string;
  namePlaceholder: string;
  start: string;
  continueTitle: string;
  language: string;
  startGuideTitle: string;
  startGuidePlay: string;
  startGuideRecords: string;
  startGuideReflect: string;
  recordsLocked: string;
  advisorLocked: string;
  records: string;
  runReport: string;
  viewRunReport: string;
  runEnded: string;
  decisionsBeforeEnding: string;
  endingCause: string;
  finalMeters: string;
  decisionTrail: string;
  card: string;
  choice: string;
  before: string;
  after: string;
  tags: string;
  risk: string;
  category: string;
  close: string;
  continueToReflection: string;
  reportNextStep: string;
  newSemester: string;
  campusWeeks: string;
  week: string;
  term: string;
  runStatus: string;
  decisionsMade: string;
  queuedLinks: string;
  dangerMeters: string;
  noRecords: string;
  initial: string;
  trajectory: string;
  finalState: string;
  startedAt: string;
  updatedAt: string;
  firstCard: string;
  totalCards: string;
  decisions: string;
  chooseRecord: string;
  resources: string;
  outcome: string;
  directionNames: Record<Direction, string>;
  resourceLabels: Record<ResourceKey, string>;
}>;
