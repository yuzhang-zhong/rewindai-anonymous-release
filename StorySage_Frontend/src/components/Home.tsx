import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Input,
  Modal,
  Progress,
  Rate,
  Row,
  Space,
  Statistic,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudSyncOutlined,
  CommentOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  InfoCircleOutlined,
  NodeIndexOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  RadarChartOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import type { StudyGroup } from '../stores/authStore';
import { apiClient, getErrorMessage } from '../utils/api';
import config, { getApiUrl } from '../config';
import {
  AppLanguage,
  getStoredLanguage,
  languageChangeEvent,
} from '../utils/language';
import {
  buildFallbackBiographyFromMessages,
  getLocalEvidencePayload,
  loadCachedBiographySnapshot,
  loadCachedChatMessages,
  saveCachedBiographySnapshot,
} from '../utils/localEvidence';

const { Title, Text, Paragraph } = Typography;

const wait = (milliseconds: number) => new Promise(resolve => {
  window.setTimeout(resolve, milliseconds);
});

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const traceFallbackKey = (userId: string) => `rewindai.traceFallback.${userId}`;

type GraphState = {
  status?: string;
  message?: string;
  progress?: number;
  updated_at?: string;
  error?: string | null;
  fallback?: boolean;
  fallback_kind?: string;
  node_count?: number;
  edge_count?: number;
};

type TraceSummary = {
  available: boolean;
  trace_count: number;
  decision_count: number;
  summary: string;
  privacy_signals?: {
    available: boolean;
    risk_level: string;
    review_required?: boolean;
    labels: Array<{
      category: string;
      severity: string;
      count: number;
      recommendation: string;
    }>;
  };
  patterns?: {
    directions?: Record<string, number>;
    risk_levels?: Record<string, number>;
    decision_types?: Record<string, number>;
    target_meters?: Record<string, number>;
  };
};

const normalizeLocalTraceSummary = (payload: Partial<TraceSummary> | null): TraceSummary | null => {
  const decisionCount = Number(payload?.decision_count ?? 0);
  const traceCount = Number(payload?.trace_count ?? 0);
  if (!Number.isFinite(decisionCount) || decisionCount <= 0) {
    return null;
  }

  return {
    available: true,
    trace_count: Number.isFinite(traceCount) && traceCount > 0 ? traceCount : 1,
    decision_count: decisionCount,
    summary: payload?.summary || `${decisionCount} simulation-test decision(s) recorded in this browser session.`,
    patterns: payload?.patterns,
    privacy_signals: payload?.privacy_signals,
  };
};

const readLocalTraceSummary = (userId: string): TraceSummary | null => {
  try {
    return normalizeLocalTraceSummary(JSON.parse(window.localStorage.getItem(traceFallbackKey(userId)) || 'null'));
  } catch {
    return null;
  }
};

const writeLocalTraceSummary = (userId: string, summary: TraceSummary) => {
  window.localStorage.setItem(traceFallbackKey(userId), JSON.stringify(summary));
};

const mergeTraceSummary = (remote: TraceSummary | null, local: TraceSummary | null): TraceSummary | null => {
  if (!local) return remote;
  if (!remote?.available || (remote.decision_count ?? 0) < local.decision_count) return local;
  return remote;
};

type FormulationState = {
  status: string;
  stale?: boolean;
  stale_reason?: string | null;
  stale_at?: string | null;
  confidence: string;
  gaps: string[];
  formulation: {
    grounding_summary: string;
    relationship_focus: string[];
    decision_policy_hypotheses: string[];
    likely_pressure_points: string[];
    simulation_guidance: string[];
    privacy_boundary: string;
  };
  evidence: {
    graph: {
      available: boolean;
      node_count: number;
      edge_count: number;
    };
    trace_summary: {
      decision_count: number;
    };
    privacy_signals?: {
      available: boolean;
      risk_level: string;
      review_required?: boolean;
      review_summary?: string;
      labels: Array<{
        category: string;
        severity: string;
        count: number;
        recommendation: string;
      }>;
    };
  };
};

type BiographySnapshot = {
  content?: string;
  subsections?: Record<string, unknown>;
};

type GeneralReflectionChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type InterviewEvidence = {
  userTurns: number;
  interviewerTurns: number;
  sessionStatus?: string;
};

type RuntimeHealth = {
  runtime?: {
    warnings?: string[];
    database?: {
      sqlite?: boolean;
    };
    mirofish?: {
      graph_sync_enabled?: boolean;
      base_url_configured?: boolean;
      base_url_is_local?: boolean;
    };
  };
};

const countNestedSections = (sections?: Record<string, unknown>): number => {
  if (!sections) return 0;

  return Object.values(sections).reduce<number>((count, section) => {
    if (!section || typeof section !== 'object') return count;
    const childSections = (section as { subsections?: Record<string, unknown> }).subsections;
    return count + 1 + countNestedSections(childSections);
  }, 0);
};

const hasBiographyContent = (biography: BiographySnapshot | null) => (
  Boolean(biography?.content?.trim()) || countNestedSections(biography?.subsections) > 0
);

const cockpitCopy = {
  en: {
    tags: ['RewindAI', 'RewindAI + MiroFish + simulation-test'],
    title: 'Personalized decision simulation cockpit',
    subtitle:
      'A natural-language grounding workflow that turns autobiographical dialogue into relationship graphs, counseling-inspired mental models, and downstream decision simulations.',
    guideTitle: 'What should I do first?',
    guideSubtitle:
      'Follow these buttons in order. Each step unlocks clearer evidence for the next one.',
    anonymousGuideTitle: 'Explore RewindAI at your own pace',
    anonymousGuideSubtitle:
      'Experience mode is flexible: start with a story, build a graph or model when ready, try simulation-test if you want, and leave feedback at the end.',
    anonymousModeTitle: 'Experience mode, not a study condition',
    anonymousModeDetail:
      'There is no required order here. RewindAI will show what each feature needs, keep sensitive details minimized, and let you move back and forth freely.',
    anonymousModeBullets: ['Free order', 'Full RewindAI features', 'Optional feedback'],
    groupLabel: 'Assigned workflow',
    groupDescriptions: {
      blank: 'Group 1 / blank: play, write your own self reflection, replay.',
      contrast: 'Group 2 / contrast: play, receive general AI reflection, replay.',
      experiment: 'Group 3 / experiment: interview, build a mental model, play once, discuss with the clone, then replay.',
      anonymous: 'Anonymous Group: full open experience without study-condition framing.',
    },
    nextStep: 'Next',
    completed: 'Done',
    waiting: 'Waiting',
    skippedInDemo: 'Skipped in hosted demo',
    graphStepUnavailableDetail:
      'Hosted MiroFish graph sync is not connected yet, so this step generates a RewindAI relationship/decision graph draft.',
    graphStepUnavailableButton: 'Generate draft graph',
    guideSteps: [
      {
        key: 'interview',
        eyebrow: 'Step 1',
        title: 'Tell a few real stories',
        detail:
          'Click Start interview and answer naturally. Aim for 6-8 turns about turning points, trade-offs, or important relationships.',
        button: 'Start interview',
      },
      {
        key: 'graph',
        eyebrow: 'Step 2',
        title: 'Build the understanding layer',
        detail:
          'Open Biography if you want to inspect the draft, then Generate graph to connect people, pressures, and decision clues.',
        button: 'Generate graph',
      },
      {
        key: 'model',
        eyebrow: 'Step 3',
        title: 'Draft your decision model',
        detail:
          'Use Build model after interview or graph evidence exists. This creates a plain-language hypothesis of how you tend to decide.',
        button: 'Build model',
      },
      {
        key: 'simulation',
        eyebrow: 'Step 4',
        title: 'Play and reflect',
        detail:
          'Launch simulation-test, finish one campus decision run, open the report, then discuss an unchosen option with the clone before replaying.',
        button: 'Launch simulation-test',
      },
    ],
    groupWorkflows: {
      blank: [
        {
          key: 'simulation',
          eyebrow: 'Step 1',
          title: 'Play the first run',
          detail: 'Click Launch simulation-test. Your account is carried over automatically.',
          hover: 'This group starts directly with the public campus game. No interview or model is needed before the first run.',
          button: 'Launch simulation-test',
        },
        {
          key: 'reflection',
          eyebrow: 'Step 2',
          title: 'Write your own reflection',
          detail: 'After the report opens, write what you noticed and what you may try differently.',
          hover: 'Blank group reflection is self-authored. It should not use AI or personal profile context.',
          button: 'Write reflection',
        },
        {
          key: 'replay',
          eyebrow: 'Step 3',
          title: 'Replay and submit',
          detail: 'Play again, then keep the final report. Both runs stay connected to this account.',
          hover: 'The system compares the first and second run through stored trajectories and report data.',
          button: 'Launch simulation-test',
        },
      ],
      contrast: [
        {
          key: 'simulation',
          eyebrow: 'Step 1',
          title: 'Play the first run',
          detail: 'Start with the same public campus game and finish one run.',
          hover: 'This group receives no personal interview or graph context before reflection.',
          button: 'Launch simulation-test',
        },
        {
          key: 'generalReflection',
          eyebrow: 'Step 2',
          title: 'Use general AI reflection',
          detail: 'Ask for a general reflection based only on the game report, not your biography.',
          hover: 'The API can summarize trade-offs from the run, but it must not use StorySage memory, graph, or clone context.',
          button: 'Open AI chat',
        },
        {
          key: 'replay',
          eyebrow: 'Step 3',
          title: 'Replay and submit',
          detail: 'Use that general reflection to play a second run and save the result.',
          hover: 'This creates a contrast against self-reflection and RewindAI clone reflection.',
          button: 'Launch simulation-test',
        },
      ],
      experiment: [
        {
          key: 'interview',
          eyebrow: 'Step 1',
          title: 'Tell a few real stories',
          detail: 'Click Start interview and answer naturally about turning points, trade-offs, and relationships.',
          hover: 'The interview grounds the clone. Aim for enough detail that the system can infer decision tendencies.',
          button: 'Start interview',
        },
        {
          key: 'graph',
          eyebrow: 'Step 2',
          title: 'Build the understanding layer',
          detail: 'Generate the relationship graph and mental-model draft from the interview evidence.',
          hover: 'This is where the clone gets its reflective grounding: relationship pressure, values, and decision-policy hypotheses.',
          button: 'Generate graph/model',
        },
        {
          key: 'simulation',
          eyebrow: 'Step 3',
          title: 'Play the first run',
          detail: 'Launch simulation-test and finish one public random campus deck. The game itself is not personalized.',
          hover: 'This creates the first-run trace that the dashboard clone can discuss afterward.',
          button: 'Launch simulation-test',
        },
        {
          key: 'cloneReflection',
          eyebrow: 'Step 4',
          title: 'Discuss with your clone',
          detail: 'Return here and chat with the clone about unchosen paths, mismatches, and one second-run strategy.',
          hover: 'This chat uses the mental-model draft plus first-run trace. It is a reflective aid, not an answer key.',
          button: 'Open clone chat',
        },
        {
          key: 'replay',
          eyebrow: 'Step 5',
          title: 'Replay and submit',
          detail: 'Use the clone discussion to try one change in the second run, then keep the final report.',
          hover: 'The second run lets us compare whether reflection changed the trajectory.',
          button: 'Launch simulation-test',
        },
      ],
      anonymous: [
        {
          key: 'interview',
          eyebrow: 'Explore',
          title: 'Share any story',
          detail: 'Start with a natural conversation if you want RewindAI to understand turning points, trade-offs, and relationships.',
          hover: 'This is optional but makes the graph and model more meaningful.',
          button: 'Start interview',
        },
        {
          key: 'graph',
          eyebrow: 'Understand',
          title: 'See the understanding layer',
          detail: 'Generate a relationship/decision graph and a mental-model draft from what you shared.',
          hover: 'The graph is a privacy-safe draft for reflection, not a psychological diagnosis.',
          button: 'Generate understanding',
        },
        {
          key: 'simulation',
          eyebrow: 'Experience',
          title: 'Try a scenario',
          detail: 'Open simulation-test only if you are curious about the decision loop. The first run can give your clone something concrete to discuss.',
          hover: 'The campus deck is public and random; it is not personalized from your biography.',
          button: 'Open experience',
        },
        {
          key: 'cloneReflection',
          eyebrow: 'Reflect',
          title: 'Reflect with clone',
          detail: 'Open a personal clone conversation after you share stories or try a scenario. It uses your biography, mental-model draft, and available traces to discuss unchosen paths.',
          hover: 'This is the same clone reflection style as Group 3, but presented as an open experience rather than a study step.',
          button: 'Open clone reflection',
        },
      ],
    },
    startInterview: 'Start interview',
    biography: 'Biography',
    generateGraph: 'Generate understanding',
    showGraph: 'Show graph',
    launchRewind: 'Launch simulation-test',
    launchExperience: 'Open experience',
    feedbackTitle: 'How did this feel?',
    feedbackDetail: 'Anonymous Group feedback is saved so the team can improve the experience. Please avoid names or sensitive details.',
    feedbackPlaceholder: 'What felt useful, confusing, uncomfortable, or promising?',
    feedbackRating: 'Rating',
    feedbackSubmit: 'Save feedback',
    feedbackSaved: 'Thanks, your experience feedback was saved.',
    feedbackRequired: 'Please write a short note first.',
    blankReflectionTitle: 'Self-reflection space',
    blankReflectionDetail:
      'Use this temporary space to write what you noticed after the first run. It is not saved or uploaded.',
    blankReflectionPlaceholder:
      'Example: What went wrong? Which choices surprised me? What will I try differently in the second run?',
    blankReflectionPrivacy: 'Temporary note only. Refreshing or leaving this page will clear it.',
    blankReflectionOpen: 'Write reflection',
    blankReflectionClear: 'Clear note',
    blankReflectionReady: 'When you are ready, launch simulation-test again for the second run.',
    contrastChatTitle: 'General AI reflection',
    contrastChatBoundary:
      'Group 2 boundary: this chat uses only simulation-test trace summaries and your messages here. It does not use biography, graph, mental model, or clone context.',
    contrastChatPlaceholder: 'Ask about your game report, recurring failure categories, or one strategy for the second run...',
    contrastChatSend: 'Send',
    contrastChatStarter:
      'I can help you reflect on the game report in a general way. What part of the first run felt most worth changing?',
    contrastChatEmptyTrace:
      'Finish the first simulation-test run first so this chat has a game report to discuss.',
    cloneChatTitle: 'RewindAI clone reflection',
    cloneChatBoundary:
      'Group 3 boundary: this is a tentative decision-pattern clone grounded in your mental-model draft and first simulation-test trace. It should explain choices through that model, but it does not create personalized game cards or decide for you.',
    anonymousCloneChatBoundary:
      'Experience boundary: this reflective clone uses your available biography and mental-model evidence. Game traces are optional; when no trace exists, it works as a general self-reflection chat grounded in your current profile.',
    cloneChatPlaceholder: 'Ask the clone about an unchosen option, a mismatch, or one strategy to test in the second run...',
    cloneChatStarter:
      'I am loading your current mental-model draft and first-run trace. Ask me about a choice, and I will answer in the form: because your model suggests X, this scenario may trigger Y; if you choose differently, it may test Z.',
    anonymousCloneChatStarter:
      'I can reflect with your current RewindAI profile. If you have game traces, I will use them as concrete examples; if not, ask about a decision pattern, trade-off, or possible future choice.',
    cloneChatEmptyTrace:
      'Finish the first simulation-test run first, then return here so the clone has a trace to discuss.',
    cloneTraceSignalOn:
      'Game trace signal is on: this chat can reference your simulation-test trajectory.',
    cloneTraceSignalOff:
      'No game trace yet: this chat will use biography and mental-model evidence as a general self-reflection space.',
    cloneChatNeedsModel:
      'Build the mental model first so the clone can reflect from your decision-pattern hypotheses instead of acting like a generic chatbot.',
    anonymousCloneSectionTitle: 'Reflect with your personal clone',
    anonymousCloneSectionDetail:
      'After you share stories or try a scenario, open a conversation that works like Group 3 clone reflection: it uses your biography, mental-model draft, and available traces to discuss unchosen paths and possible next choices.',
    anonymousCloneSectionButton: 'Open clone reflection',
    loginFirst: 'Please login first.',
    notSignedIn: 'not signed in',
    participant: 'participant',
    dataSources: 'evidence sources',
    traceDecisions: 'trace decisions',
    graphSync: 'Graph sync',
    graphEmpty: 'Graph has not been built yet.',
    refreshState: 'Refresh state',
    groundingReadiness: 'Evidence readiness',
    groundingDescription:
      'These bars show available evidence, not prediction accuracy. RewindAI keeps interview, biography, graph, and traces separate until they are reviewed.',
    interviewEvidence: 'Interview evidence',
    livedExperience: 'Biography draft',
    relationships: 'Relationship graph',
    simulationTraces: 'Trace evidence coverage',
    behavioralTraceGrounding: 'Behavioral trace evidence',
    noTracesYet: 'no traces yet',
    runCount: (count: number) => `${count} run(s)`,
    decisionCount: (count: number) => `${count} decision(s)`,
    traceEmpty: 'Launch simulation-test from this page and play decisions to feed behavioral traces back into RewindAI.',
    traceEvidenceNote:
      'Trace coverage is intentionally capped below 100% because a few runs cannot fully capture someone’s decision pattern.',
    tracePrivacyPrefix: 'Trace privacy boundary:',
    tracePrivacySuffix: 'label(s) generalized before storage.',
    traceReviewRequired: 'Review required before using trace details outside this demo.',
    traceReviewClear: 'No trace review required by privacy check.',
    formulationTitle: 'Mental model formulation',
    notBuilt: 'not built',
    unknown: 'unknown',
    formulationEmpty: 'Build a draft formulation from biography, graph state, and simulation-test decision traces.',
    gap: 'Gap:',
    stale: 'Stale:',
    privacyBoundary: 'Privacy boundary:',
    formulationReviewRequired: 'Review required before exporting raw details.',
    formulationReviewClear: 'No sensitive review required by privacy check.',
    buildModel: 'Build model',
    demoFlow: 'Demo flow',
    currentWiring: 'Current system wiring',
    flowItems: [
      'Natural interview grounds lived experience',
      'Biography and memory become privacy-safe context',
      'MiroFish builds relationship and cognitive graph',
      'simulation-test uses a public random campus deck',
      'simulation-test traces return to StorySage after play',
    ],
    groundingTracks: 'Evidence tracks',
    representationModes: 'Representation modes',
    sourceTracks: [
      {
        title: 'Autobiographical dialogue',
        detail: 'natural memories, relationships, turning points',
        tag: 'RewindAI',
      },
      {
        title: 'Relationship graph',
        detail: 'people, obligations, trust, conflict, influence',
        tag: 'MiroFish',
      },
      {
        title: 'Decision simulation',
        detail: 'public campus scenarios and future behavioral traces',
        tag: 'simulation-test',
      },
    ],
    memoryModes: [
      {
        title: 'Direct retrieval',
        text: 'reuse explicitly remembered episodes when a scenario matches',
      },
      {
        title: 'Graph reasoning',
        text: 'infer pressure from obligations, conflict, trust, and influence',
      },
      {
        title: 'Formulation',
        text: 'explain how this person differs from a generic participant',
      },
    ],
    graphStarted: 'Graph rebuild started.',
    modelRebuilt: 'Mental model draft rebuilt.',
    graphServiceUnavailable:
      'MiroFish native sync is not connected, so RewindAI will generate a local relationship/decision graph draft instead.',
    graphServiceWarning:
      'Pilot mode: graph generation will use a RewindAI relationship/decision draft while the public MiroFish backend is unavailable.',
    demoStorageWarning:
      'Pilot mode: please finish the current step in one sitting when possible. The facilitator will confirm final data capture before analysis.',
    missingRewindUrl: 'VITE_REWIND_APP_URL is required for deployed StorySage builds.',
    graphTokenMissing: 'Graph viewer token was not returned.',
    needsBiography: 'Start the interview first so RewindAI has autobiography data to work with.',
    needsGraph: 'Generate the graph first, then the graph viewer will open here.',
    needsGrounding: 'Start the interview or generate the graph first, then build the mental model.',
    rewindUnavailable: 'simulation-test is not reachable yet. Please start the game service first.',
    errors: {
      graphLoad: 'Failed to load graph state: ',
      graphRebuild: 'Failed to start graph rebuild: ',
      graphViewer: 'Failed to open graph viewer: ',
      rewind: 'Failed to launch simulation-test: ',
      model: 'Failed to rebuild mental model: ',
    },
  },
  zh: {
    tags: ['RewindAI', 'RewindAI + MiroFish + simulation-test'],
    title: '个性化决策模拟工作台',
    subtitle:
      '通过自然语言访谈收集自传经历，并逐步生成关系图、咨询式心智模型与后续决策模拟。',
    guideTitle: '我现在应该先做什么？',
    guideSubtitle:
      '按下面顺序点击即可。每一步都会为下一步补充更可靠的证据。',
    anonymousGuideTitle: '按自己的节奏体验 RewindAI',
    anonymousGuideSubtitle:
      '这是自由体验模式：可以先讲故事，也可以先看图谱/模型；想体验决策循环时再打开 simulation-test，最后可留下感受。',
    anonymousModeTitle: '完整体验模式，不是实验分组',
    anonymousModeDetail:
      '这里没有强制顺序。RewindAI 会提示每个功能需要什么证据，尽量减少敏感细节暴露，也允许你自由来回探索。',
    anonymousModeBullets: ['顺序自由', '完整功能', '反馈可选'],
    groupLabel: '当前流程',
    groupDescriptions: {
      blank: 'Group 1 / blank：先玩游戏，自己写反思，再重玩。',
      contrast: 'Group 2 / contrast：先玩游戏，用通用 AI 反思，再重玩。',
      experiment: 'Group 3 / experiment：先访谈和建模，第一次游戏后回到工作台和 clone 反思，再重玩。',
      anonymous: 'Anonymous Group：完整开放体验，不使用实验条件叙事。',
    },
    nextStep: '下一步',
    completed: '已完成',
    waiting: '等待中',
    skippedInDemo: '线上演示中跳过',
    graphStepUnavailableDetail:
      '当前线上 MiroFish 图谱同步还没有接公网，因此这里会先生成 RewindAI 关系/决策图谱草稿。',
    graphStepUnavailableButton: '生成草稿图谱',
    guideSteps: [
      {
        key: 'interview',
        eyebrow: '第 1 步',
        title: '先讲几个真实故事',
        detail:
          '点击“开始访谈”，像聊天一样回答即可。建议先聊 6-8 轮，重点讲转折点、取舍和重要关系。',
        button: '开始访谈',
      },
      {
        key: 'graph',
        eyebrow: '第 2 步',
        title: '生成理解层',
        detail:
          '如果想看草稿可以先点“自传”，然后点“生成图谱”，把人物、压力和决策线索连起来。',
        button: '生成图谱',
      },
      {
        key: 'model',
        eyebrow: '第 3 步',
        title: '生成心智模型草稿',
        detail:
          '访谈或图谱有证据后，点击“生成模型”，系统会用自然语言总结你的决策倾向假设。',
        button: '生成模型',
      },
      {
        key: 'simulation',
        eyebrow: '第 4 步',
        title: '玩一次并反思',
        detail:
          '启动 simulation-test，完成一轮校园决策，打开报告，再和 clone 讨论一个当时没选的选项后重玩。',
        button: '启动 simulation-test',
      },
    ],
    groupWorkflows: {
      blank: [
        {
          key: 'simulation',
          eyebrow: '第 1 步',
          title: '先玩第一轮',
          detail: '点击启动 simulation-test，账号会自动关联，不需要重新输入用户名。',
          hover: 'Blank 组不需要先访谈或生成模型，直接进入公共校园题库。',
          button: '启动 simulation-test',
        },
        {
          key: 'reflection',
          eyebrow: '第 2 步',
          title: '自己写反思',
          detail: '报告出现后，写下你观察到的问题，以及第二轮想怎么改。',
          hover: '这一组的反思完全由用户自己完成，不使用 AI，也不使用个人画像。',
          button: '写反思',
        },
        {
          key: 'replay',
          eyebrow: '第 3 步',
          title: '重玩并提交',
          detail: '再玩一轮，最后保留报告。两次记录都会关联到当前账号。',
          hover: '系统会通过轨迹和报告记录第一轮与第二轮的差异。',
          button: '启动 simulation-test',
        },
      ],
      contrast: [
        {
          key: 'simulation',
          eyebrow: '第 1 步',
          title: '先玩第一轮',
          detail: '从同样的公共校园题库开始，完成一轮选择。',
          hover: 'Contrast 组在反思前不使用访谈、自传、图谱或 clone 上下文。',
          button: '启动 simulation-test',
        },
        {
          key: 'generalReflection',
          eyebrow: '第 2 步',
          title: '使用通用 AI 反思',
          detail: '基于游戏报告做一般性反思，不调用你的自传或图谱。',
          hover: 'API 只总结这次游戏中的取舍，不使用 StorySage memory、graph 或 clone。',
          button: '打开 AI 对话',
        },
        {
          key: 'replay',
          eyebrow: '第 3 步',
          title: '重玩并提交',
          detail: '带着通用反思再玩一轮，并保存结果。',
          hover: '这组用于和“自己反思”以及“RewindAI clone 反思”做对照。',
          button: '启动 simulation-test',
        },
      ],
      experiment: [
        {
          key: 'interview',
          eyebrow: '第 1 步',
          title: '先讲几个真实故事',
          detail: '点击开始访谈，自然讲转折点、取舍和重要关系。',
          hover: '访谈用于 grounding clone。细节越自然，后面的反思越容易贴近你的决策方式。',
          button: '开始访谈',
        },
        {
          key: 'graph',
          eyebrow: '第 2 步',
          title: '生成理解层',
          detail: '访谈有证据后，生成关系图谱和心智模型草稿。',
          hover: '这一步给 clone 提供 grounding：关系压力、价值取舍和决策倾向假设。',
          button: '生成图谱/模型',
        },
        {
          key: 'simulation',
          eyebrow: '第 3 步',
          title: '先玩第一轮',
          detail: '启动 simulation-test，完成一轮公共随机校园题库。游戏本身不个性化。',
          hover: '这一轮会产生行为轨迹，之后回到工作台让 clone 讨论。',
          button: '启动 simulation-test',
        },
        {
          key: 'cloneReflection',
          eyebrow: '第 4 步',
          title: '和 clone 探讨',
          detail: '回到这里，和 clone 讨论未选路径、选择差异，以及第二轮可以尝试的一个策略。',
          hover: '这个聊天使用心智模型草稿和第一轮游戏轨迹；它是反思辅助，不是答案机器。',
          button: '打开 clone 对话',
        },
        {
          key: 'replay',
          eyebrow: '第 5 步',
          title: '再玩一次并提交',
          detail: '带着 clone 讨论出的一个改变再玩第二轮，并保留最终报告。',
          hover: '第二轮用于观察反思后轨迹是否发生变化。',
          button: '启动 simulation-test',
        },
      ],
      anonymous: [
        {
          key: 'interview',
          eyebrow: '自由探索',
          title: '讲任意故事',
          detail: '如果想让 RewindAI 更理解你，可以先自然聊一次转折点、取舍或重要关系。',
          hover: '这一步不是强制任务，但会让后面的图谱和模型更有意义。',
          button: '开始访谈',
        },
        {
          key: 'graph',
          eyebrow: '理解自己',
          title: '查看理解层',
          detail: '基于你分享的内容生成关系/决策图谱和心智模型草稿。',
          hover: '图谱是隐私安全的反思草稿，不是心理诊断。',
          button: '生成理解层',
        },
        {
          key: 'simulation',
          eyebrow: '体验',
          title: '体验一个场景',
          detail: '只有在你想尝试决策循环时再打开 simulation-test；第一轮轨迹可以给 clone 一个具体讨论对象。',
          hover: '校园题库是公共随机题库，不会根据你的自传生成个性化卡片。',
          button: '打开体验',
        },
        {
          key: 'cloneReflection',
          eyebrow: '反思',
          title: '和 clone 对话反思',
          detail: '讲过故事或体验过场景后，可以打开个人 clone 对话。它会结合自传、心智模型草稿和已有轨迹，讨论没选的路径和下一次可能尝试的选择。',
          hover: '这和 Group 3 的 clone 反思能力一致，但在 anonymous 中作为开放体验呈现，不作为实验步骤。',
          button: '打开 clone 反思',
        },
      ],
    },
    startInterview: '开始访谈',
    biography: '自传',
    generateGraph: '生成理解层',
    showGraph: '查看图谱',
    launchRewind: '启动 simulation-test',
    launchExperience: '打开体验',
    feedbackTitle: '体验感受',
    feedbackDetail: 'Anonymous Group 的体验感受会保存给团队改进产品。请避免写入姓名或敏感细节。',
    feedbackPlaceholder: '哪里有帮助、哪里困惑、哪里不舒服、哪里有潜力？',
    feedbackRating: '评分',
    feedbackSubmit: '保存反馈',
    feedbackSaved: '谢谢，体验感受已保存。',
    feedbackRequired: '请先写一点体验感受。',
    blankReflectionTitle: '自我反思空间',
    blankReflectionDetail:
      '完成第一轮后，可以在这里临时写下你观察到的问题和下一轮想尝试的改变。这里不会保存或上传。',
    blankReflectionPlaceholder:
      '例如：我哪里失衡了？哪些选择让我意外？第二轮我想换一种什么策略？',
    blankReflectionPrivacy: '仅当前页面临时记录。刷新或离开页面后会清空。',
    blankReflectionOpen: '写反思',
    blankReflectionClear: '清空',
    blankReflectionReady: '准备好后，再次启动 simulation-test 开始第二轮。',
    contrastChatTitle: '通用 AI 反思',
    contrastChatBoundary:
      'Group 2 边界：这个对话只使用 simulation-test 的游戏记录摘要和你在这里发的消息，不使用自传、图谱、心智模型或 clone 上下文。',
    contrastChatPlaceholder: '可以问：我的游戏报告里哪里最容易失衡？第二轮可以试一个什么策略？',
    contrastChatSend: '发送',
    contrastChatStarter:
      '我可以只基于游戏报告做通用反思。你觉得第一轮最想改变的是哪一类选择？',
    contrastChatEmptyTrace:
      '请先完成第一轮 simulation-test，这样这里才有游戏报告可以讨论。',
    cloneChatTitle: 'RewindAI clone 反思',
    cloneChatBoundary:
      'Group 3 边界：这是一个基于你的心智模型草稿和第一轮 simulation-test 轨迹的“暂定决策模式 clone”。它应该通过心智模型解释选择，但不会生成个性化游戏卡，也不会替你做决定。',
    anonymousCloneChatBoundary:
      '体验边界：这个反思性 clone 会使用你已有的自传和心智模型证据。游戏轨迹只是可选增强；没有轨迹时，它就是一个基于当前 profile 的自我反思对话。',
    cloneChatPlaceholder: '可以问：某个没选的选项代表什么？clone 为什么可能会做不同选择？第二轮我可以测试什么策略？',
    cloneChatStarter:
      '我会先加载你的心智模型草稿和第一轮游戏轨迹。你可以问我某个选择，我会尽量用“因为你的心智模型显示 X，所以这个情境可能触发 Y；如果换一种选择，可能测试 Z”的方式回答。',
    anonymousCloneChatStarter:
      '我会基于你当前的 RewindAI profile 和你对话。若已有游戏轨迹，我会把它作为具体例子；如果还没有，也可以直接问某个决策模式、取舍或未来选择。',
    cloneChatEmptyTrace:
      '请先完成第一轮 simulation-test，再回到这里，这样 clone 才有游戏轨迹可以讨论。',
    cloneTraceSignalOn:
      '游戏轨迹信号已亮起：这个对话可以参考你的 simulation-test 决策轨迹。',
    cloneTraceSignalOff:
      '暂时没有游戏轨迹：这里会作为基于自传和心智模型的普通自我反思对话。',
    cloneChatNeedsModel:
      '请先生成心智模型草稿，这样 clone 才能基于你的决策模式假设来反思，而不是变成普通聊天机器人。',
    anonymousCloneSectionTitle: '和自己的 clone 反思',
    anonymousCloneSectionDetail:
      '在你讲过故事或体验过场景后，可以打开一个和 Group 3 类似的 clone 对话：它会结合你的自传、心智模型草稿和已有轨迹，帮你讨论没选的路径、关键取舍和下一次可能尝试的选择。',
    anonymousCloneSectionButton: '打开 clone 反思',
    loginFirst: '请先登录。',
    notSignedIn: '未登录',
    participant: '参与者',
    dataSources: '证据来源',
    traceDecisions: '轨迹决策',
    graphSync: '图谱同步',
    graphEmpty: '图谱还没有生成。',
    refreshState: '刷新状态',
    groundingReadiness: '证据准备度',
    groundingDescription:
      '这些进度表示当前有哪些证据可用，不代表预测准确率。RewindAI 会把访谈、自传、图谱和轨迹分开保存，再逐步汇总。',
    interviewEvidence: '访谈证据',
    livedExperience: '自传草稿',
    relationships: '关系图谱',
    simulationTraces: '轨迹证据覆盖',
    behavioralTraceGrounding: '行为轨迹证据',
    noTracesYet: '还没有轨迹',
    runCount: (count: number) => `${count} 次模拟`,
    decisionCount: (count: number) => `${count} 个决策`,
    traceEmpty: '从本页启动 simulation-test 并完成选择后，行为轨迹会回流到 RewindAI。',
    traceEvidenceNote:
      '轨迹覆盖会刻意保留余量：少量模拟只能提供决策线索，不能代表已经完整捕捉一个人的决策模式。',
    tracePrivacyPrefix: '轨迹隐私边界：',
    tracePrivacySuffix: '个标签已在存储前泛化处理。',
    traceReviewRequired: '在本 demo 外使用轨迹细节前需要人工复核。',
    traceReviewClear: '隐私检查未要求复核。',
    formulationTitle: '心智模型草稿',
    notBuilt: '未生成',
    unknown: '未知',
    formulationEmpty: '可基于自传、图谱状态和 simulation-test 决策轨迹生成一版心智模型草稿。',
    gap: '缺口：',
    stale: '已过期：',
    privacyBoundary: '隐私边界：',
    formulationReviewRequired: '导出原始细节前需要人工复核。',
    formulationReviewClear: '隐私检查未要求敏感复核。',
    buildModel: '生成模型',
    demoFlow: 'Demo 流程',
    currentWiring: '当前系统连接',
    flowItems: [
      '自然访谈收集生活经历',
      '自传和记忆转化为隐私安全上下文',
      'MiroFish 构建关系与认知图谱',
      'simulation-test 使用公共随机校园题库',
      'simulation-test 结束后轨迹回流到 StorySage',
    ],
    groundingTracks: '证据轨道',
    representationModes: '表征方式',
    sourceTracks: [
      {
        title: '自传式对话',
        detail: '自然记忆、关系、关键转折点',
        tag: 'RewindAI',
      },
      {
        title: '关系图谱',
        detail: '人物、责任、信任、冲突与影响力',
        tag: 'MiroFish',
      },
      {
        title: '决策模拟',
        detail: '公共校园情景与未来行为轨迹',
        tag: 'simulation-test',
      },
    ],
    memoryModes: [
      {
        title: '直接检索',
        text: '当情景匹配时复用明确提到过的经历',
      },
      {
        title: '图谱推理',
        text: '从责任、冲突、信任和影响关系中推断压力',
      },
      {
        title: '模型表述',
        text: '解释这个人和普通参与者的差异',
      },
    ],
    graphStarted: '图谱重建已开始。',
    modelRebuilt: '心智模型草稿已重新生成。',
    graphServiceUnavailable:
      '当前未接入公网 MiroFish 图谱服务，RewindAI 会先生成本地关系/决策图谱草稿。',
    graphServiceWarning:
      '当前是试用模式：公网 MiroFish 后端不可用时，图谱会以 RewindAI 关系/决策草稿形式生成。',
    demoStorageWarning:
      '当前是试用模式：请尽量一次完成当前步骤。研究人员会在正式分析前确认数据保存情况。',
    missingRewindUrl: '部署版本需要配置 VITE_REWIND_APP_URL。',
    graphTokenMissing: '没有返回图谱查看 token。',
    needsBiography: '请先开始访谈，让 RewindAI 有自传数据可以使用。',
    needsGraph: '请先生成图谱，然后就可以打开图谱查看器。',
    needsGrounding: '请先开始访谈或生成图谱，再生成心智模型。',
    rewindUnavailable: 'simulation-test 服务还不可用，请先启动游戏服务。',
    errors: {
      graphLoad: '加载图谱状态失败：',
      graphRebuild: '启动图谱重建失败：',
      graphViewer: '打开图谱查看器失败：',
      rewind: '启动 simulation-test 失败：',
      model: '重建心智模型失败：',
    },
  },
};

const Home: React.FC = () => {
  const navigate = useNavigate();
  const userId = useAuthStore(state => state.userId);
  const token = useAuthStore(state => state.token);
  const studyGroup = useAuthStore(state => state.studyGroup);
  const setStudyGroup = useAuthStore(state => state.setStudyGroup);
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredLanguage());
  const copy = cockpitCopy[language];
  const [biographySnapshot, setBiographySnapshot] = useState<BiographySnapshot | null>(null);
  const [graphState, setGraphState] = useState<GraphState | null>(null);
  const [interviewEvidence, setInterviewEvidence] = useState<InterviewEvidence | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphSyncing, setGraphSyncing] = useState(false);
  const [rewindLaunching, setRewindLaunching] = useState(false);
  const [traceSummary, setTraceSummary] = useState<TraceSummary | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [formulation, setFormulation] = useState<FormulationState | null>(null);
  const [formulationLoading, setFormulationLoading] = useState(false);
  const [formulationRebuilding, setFormulationRebuilding] = useState(false);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
  const [experienceFeedback, setExperienceFeedback] = useState('');
  const [experienceRating, setExperienceRating] = useState<number>(0);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [blankReflectionOpen, setBlankReflectionOpen] = useState(false);
  const [blankReflectionDraft, setBlankReflectionDraft] = useState('');
  const [contrastChatOpen, setContrastChatOpen] = useState(false);
  const [contrastChatInput, setContrastChatInput] = useState('');
  const [contrastChatMessages, setContrastChatMessages] = useState<GeneralReflectionChatMessage[]>([]);
  const [contrastChatSending, setContrastChatSending] = useState(false);
  const [cloneChatOpen, setCloneChatOpen] = useState(false);
  const [cloneChatInput, setCloneChatInput] = useState('');
  const [cloneChatMessages, setCloneChatMessages] = useState<GeneralReflectionChatMessage[]>([]);
  const [cloneChatSending, setCloneChatSending] = useState(false);
  const isAnonymousExperience = studyGroup === 'anonymous';
  const usesPersonalModel = studyGroup === 'experiment' || isAnonymousExperience;
  const graphServiceUnavailable = Boolean(
    runtimeHealth?.runtime?.mirofish
    && (
      runtimeHealth.runtime.mirofish.graph_sync_enabled === false
      || runtimeHealth.runtime.mirofish.base_url_is_local === true
      || runtimeHealth.runtime.mirofish.base_url_configured === false
    ),
  );
  const demoStorageActive = Boolean(
    runtimeHealth?.runtime?.database?.sqlite
    || runtimeHealth?.runtime?.warnings?.some(warning => warning.toLowerCase().includes('sqlite')),
  );

  const graphStatus = graphState?.status || 'idle';
  const graphProgress = graphState?.progress ?? (graphStatus === 'completed' ? 100 : 0);
  const interviewAvailable = Boolean(interviewEvidence?.userTurns);
  const biographyAvailable = hasBiographyContent(biographySnapshot);
  const graphAvailable = graphStatus === 'completed';
  const traceAvailable = Boolean(traceSummary?.available);
  const dataSourceCount = [
    interviewAvailable,
    biographyAvailable,
    graphAvailable,
    traceAvailable,
  ].filter(Boolean).length;
  const interviewProgress = interviewEvidence?.userTurns
    ? Math.min(100, Math.max(12, Math.round((Math.min(interviewEvidence.userTurns, 8) / 8) * 100)))
    : 0;
  const livedExperienceProgress = biographyAvailable
    ? Math.min(100, Math.max(20, countNestedSections(biographySnapshot?.subsections) * 14 + (biographySnapshot?.content?.trim() ? 20 : 0)))
    : 0;
  const relationshipProgress = graphAvailable
    ? 100
    : graphStatus === 'running' || graphStatus === 'queued'
      ? Math.min(95, Math.max(5, graphProgress))
      : 0;
  const traceProgress = traceSummary?.available
    ? Math.min(
      90,
      Math.max(
        30,
        Math.round((Math.min(traceSummary.decision_count, 30) / 30) * 72)
          + Math.min(traceSummary.trace_count, 2) * 8,
      ),
    )
    : 0;
  const dimensions = [
    { label: copy.interviewEvidence, value: interviewProgress, color: '#15803d' },
    { label: copy.livedExperience, value: livedExperienceProgress, color: '#0f766e' },
    { label: copy.relationships, value: relationshipProgress, color: '#b45309' },
    { label: copy.simulationTraces, value: traceProgress, color: '#4338ca' },
  ];

  const graphTone = useMemo(() => {
    if (graphStatus === 'completed') return 'success';
    if (graphStatus === 'failed') return 'error';
    if (graphStatus === 'running' || graphStatus === 'queued') return 'processing';
    return 'default';
  }, [graphStatus]);

  const requireLogin = () => {
    if (!userId || !token) {
      message.error(copy.loginFirst);
      navigate('/login');
      return false;
    }
    return true;
  };

  const fetchRuntimeHealth = async () => {
    try {
      const response = await apiClient('HEALTH', {
        method: 'GET',
        requireAuth: false,
        timeoutMs: 8000,
      });
      setRuntimeHealth(response as RuntimeHealth);
    } catch {
      setRuntimeHealth(null);
    }
  };

  const fetchBiographySnapshot = async () => {
    if (!userId || !token) return;

    try {
      const response = await apiClient('BIOGRAPHY_LATEST', { method: 'GET' });
      setBiographySnapshot(response as BiographySnapshot);
      saveCachedBiographySnapshot(userId, response as any);
    } catch {
      const localBiography = loadCachedBiographySnapshot(userId)
        || buildFallbackBiographyFromMessages(userId, loadCachedChatMessages(userId));
      setBiographySnapshot(localBiography);
      if (localBiography) {
        saveCachedBiographySnapshot(userId, localBiography);
      }
    }
  };

  const hydrateLocalBiographySnapshot = () => {
    if (!userId) return null;
    const localBiography = loadCachedBiographySnapshot(userId)
      || buildFallbackBiographyFromMessages(userId, loadCachedChatMessages(userId));
    setBiographySnapshot(localBiography);
    if (localBiography) {
      saveCachedBiographySnapshot(userId, localBiography);
    }
    return localBiography;
  };

  const fetchInterviewEvidence = async (): Promise<InterviewEvidence | null> => {
    if (!userId || !token) return null;

    try {
      const response = await apiClient('MESSAGES', { method: 'GET' });
      const messages = Array.isArray(response.messages) ? response.messages : [];
      const cachedMessages = loadCachedChatMessages(userId);
      const mergedMessages = messages.length >= cachedMessages.length ? messages : cachedMessages;
      const evidence = {
        userTurns: mergedMessages.filter((item: { role?: string; content?: string }) => (
          item.role === 'User' && Boolean(item.content?.trim())
        )).length,
        interviewerTurns: mergedMessages.filter((item: { role?: string; content?: string }) => (
          item.role === 'Interviewer' && Boolean(item.content?.trim())
        )).length,
        sessionStatus: response.session_status,
      };
      setInterviewEvidence(evidence);
      return evidence;
    } catch {
      const cachedMessages = loadCachedChatMessages(userId);
      const evidence = {
        userTurns: cachedMessages.filter(item => item.role === 'User' && Boolean(item.content?.trim())).length,
        interviewerTurns: cachedMessages.filter(item => item.role === 'Interviewer' && Boolean(item.content?.trim())).length,
        sessionStatus: undefined,
      };
      const hasEvidence = Boolean(evidence.userTurns || evidence.interviewerTurns);
      setInterviewEvidence(hasEvidence ? evidence : null);
      return hasEvidence ? evidence : null;
    }
  };

  const syncLocalEvidenceToBackend = async () => {
    if (!userId || !token) return;
    const payload = getLocalEvidencePayload(userId);
    if (!payload.biography && payload.messages.length === 0) return;
    try {
      await apiClient('EVIDENCE_SYNC', {
        method: 'POST',
        timeoutMs: 8000,
        body: JSON.stringify(payload),
      });
    } catch {
      // Same-browser fallback remains available if a serverless instance changes.
    }
  };

  const fetchGraphState = async () => {
    if (!userId || !token) return;

    try {
      setGraphLoading(true);
      const response = await apiClient('GRAPH_STATE', { method: 'GET' });
      setGraphState(response.data);
    } catch (error) {
      message.error(copy.errors.graphLoad + (error as Error).message);
    } finally {
      setGraphLoading(false);
    }
  };

  const fetchTraceSummary = async (): Promise<TraceSummary | null> => {
    if (!userId || !token) return null;

    try {
      setTraceLoading(true);
      const response = await apiClient('SIMULATION_TRACE_SUMMARY', { method: 'GET' });
      const localSummary = readLocalTraceSummary(userId);
      const mergedSummary = mergeTraceSummary(response, localSummary);
      setTraceSummary(mergedSummary);
      return mergedSummary;
    } catch {
      const localSummary = readLocalTraceSummary(userId);
      setTraceSummary(localSummary);
      return localSummary;
    } finally {
      setTraceLoading(false);
    }
  };

  const fetchFormulation = async () => {
    if (!userId || !token) return;
    if (!usesPersonalModel) {
      setFormulation(null);
      setFormulationLoading(false);
      return;
    }

    try {
      setFormulationLoading(true);
      const response = await apiClient('FORMULATION_CURRENT', { method: 'GET' });
      setFormulation(response.data);
    } catch {
      setFormulation(null);
    } finally {
      setFormulationLoading(false);
    }
  };

  const refreshReadinessState = async (effectiveStudyGroup = studyGroup) => {
    const effectiveUsesPersonalModel = effectiveStudyGroup === 'experiment' || effectiveStudyGroup === 'anonymous';
    const [, interview, , trace] = await Promise.all([
      fetchRuntimeHealth(),
      fetchInterviewEvidence(),
      fetchGraphState(),
      fetchTraceSummary(),
    ]);
    if (!effectiveUsesPersonalModel) {
      setBiographySnapshot(null);
      setFormulation(null);
      return;
    }

    const localBiography = hydrateLocalBiographySnapshot();
    const shouldFetchGeneratedBiography = interview?.sessionStatus === 'ended'
      || interview?.sessionStatus === 'completed'
      || interview?.sessionStatus === 'biography_ready';
    if (shouldFetchGeneratedBiography) {
      await fetchBiographySnapshot();
    }

    if (trace?.available || graphStatus === 'completed' || hasBiographyContent(localBiography)) {
      await fetchFormulation();
    } else {
      setFormulation(null);
      setFormulationLoading(false);
    }
  };

  const fetchUserProfile = async (): Promise<StudyGroup | null> => {
    if (!userId || !token) return null;
    try {
      const response = await apiClient('USER_PROFILE', { method: 'GET' });
      if (['blank', 'contrast', 'experiment', 'anonymous'].includes(response.study_group)) {
        const nextGroup = response.study_group as StudyGroup;
        setStudyGroup(nextGroup);
        return nextGroup;
      }
    } catch {
      setStudyGroup('experiment');
      return 'experiment';
    }
    return null;
  };

  const refreshGraphUntilSettled = async (initialState?: GraphState | null) => {
    let latestStatus = initialState?.status || graphStatus;

    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (latestStatus !== 'queued' && latestStatus !== 'running') break;

      await wait(1500);
      try {
        const response = await apiClient('GRAPH_STATE', { method: 'GET' });
        const latestState = response.data as GraphState;
        setGraphState(latestState);
        latestStatus = latestState.status || latestStatus;
      } catch {
        break;
      }
    }

    await Promise.all([
      fetchTraceSummary(),
      ...(usesPersonalModel ? [fetchFormulation()] : []),
    ]);
  };

  useEffect(() => {
    const loadHomeState = async () => {
      const profileGroup = await fetchUserProfile();
      await refreshReadinessState(profileGroup ?? studyGroup);
    };
    loadHomeState();
  }, [userId, token]);

  useEffect(() => {
    if (!userId) {
      setTraceSummary(null);
      return;
    }
    const localSummary = readLocalTraceSummary(userId);
    if (localSummary) {
      setTraceSummary(current => mergeTraceSummary(current, localSummary));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !token) return;
    refreshReadinessState();
  }, [studyGroup]);

  useEffect(() => {
    if (!userId) return;

    const rewindOrigin = (() => {
      try {
        return new URL(config.REWIND_APP_URL).origin;
      } catch {
        return '';
      }
    })();

    const handleTraceReturn = (event: MessageEvent) => {
      if (rewindOrigin && event.origin !== rewindOrigin) return;
      const payload = event.data as {
        type?: string;
        source?: string;
        user_id?: string;
        trace_count?: number;
        decision_count?: number;
        summary?: string;
      };
      if (payload?.type !== 'rewindai:simulation-trace-returned' || payload.source !== 'simulation-test') {
        return;
      }
      if (payload.user_id && payload.user_id !== userId) {
        return;
      }

      const localSummary = normalizeLocalTraceSummary(payload);
      if (!localSummary) return;

      writeLocalTraceSummary(userId, localSummary);
      setTraceSummary(current => mergeTraceSummary(current, localSummary));
    };

    window.addEventListener('message', handleTraceReturn);
    return () => window.removeEventListener('message', handleTraceReturn);
  }, [userId]);

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      setLanguage((event as CustomEvent<AppLanguage>).detail || getStoredLanguage());
    };
    const handleStorage = () => setLanguage(getStoredLanguage());

    window.addEventListener(languageChangeEvent, handleLanguageChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(languageChangeEvent, handleLanguageChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleStartInterview = () => {
    if (!requireLogin()) return;
    navigate('/user_chat');
  };

  const handleOpenBiography = () => {
    if (!requireLogin()) return;
    navigate('/biography');
  };

  const handleGenerateGraph = async () => {
    if (!requireLogin()) return;
    if (graphServiceUnavailable) {
      message.warning(copy.graphServiceUnavailable);
    }
    await syncLocalEvidenceToBackend();
    const localBiography = userId ? getLocalEvidencePayload(userId).biography : null;
    if (!biographyAvailable && !hasBiographyContent(localBiography)) {
      message.info(copy.needsBiography);
      navigate('/user_chat');
      return;
    }

    try {
      setGraphSyncing(true);
      const response = await apiClient('GRAPH_REBUILD', { method: 'POST' });
      setGraphState(response.data);
      message.success(copy.graphStarted);
      await refreshGraphUntilSettled(response.data);
    } catch (error) {
      message.error(copy.errors.graphRebuild + (error as Error).message);
    } finally {
      setGraphSyncing(false);
    }
  };

  const handleShowGraph = async () => {
    if (!requireLogin()) return;
    if (graphServiceUnavailable) {
      message.warning(copy.graphServiceUnavailable);
    }
    if (!graphAvailable) {
      message.info(copy.needsGraph);
      return;
    }

    try {
      setGraphLoading(true);
      const response = await apiClient('GRAPH_VIEW_TOKEN', { method: 'GET' });
      const viewToken = response.data?.view_token;
      if (!viewToken) {
        throw new Error(copy.graphTokenMissing);
      }
      const graphUrl = getApiUrl(
        `/graph/ui?view_token=${encodeURIComponent(viewToken)}&lang=${language}`
      );
      window.open(graphUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      message.error(copy.errors.graphViewer + (error as Error).message);
    } finally {
      setGraphLoading(false);
    }
  };

  const encodeGrounding = (payload: unknown) => {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };

  const checkRewindReachable = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    try {
      const healthUrl = new URL('/api/health', config.REWIND_APP_URL).toString();
      await fetch(healthUrl, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const writeGameWindowStatus = (gameWindow: Window | null, title: string, detail: string) => {
    if (!gameWindow || gameWindow.closed) return;
    const safeTitle = escapeHtml(title);
    const safeDetail = escapeHtml(detail);
    try {
      gameWindow.document.open();
      gameWindow.document.write(`
        <title>${safeTitle}</title>
        <body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 28px; line-height: 1.6; color: #1f342c; background: #fbfdf5;">
          <h1 style="font-size: 20px; margin: 0 0 10px;">${safeTitle}</h1>
          <p style="margin: 0; max-width: 560px;">${safeDetail}</p>
        </body>
      `);
      gameWindow.document.close();
    } catch {
      // The window may already be cross-origin after a successful navigation.
    }
  };

  const fetchSimulationTestHandoff = async () => {
    let lastError: unknown;
    for (const timeoutMs of [12000, 18000, 24000]) {
      try {
        return await apiClient('SIMULATION_TEST_HANDOFF', {
          method: 'GET',
          timeoutMs,
        });
      } catch (error) {
        lastError = error;
        await wait(650);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(copy.errors.rewind);
  };

  const handleLaunchRewind = async () => {
    if (!requireLogin()) return;

    const gameWindow = window.open('', '_blank');
    if (gameWindow) {
      writeGameWindowStatus(
        gameWindow,
        'Opening simulation-test...',
        'RewindAI is preparing your account handoff. Please keep this window open.',
      );
    }

    try {
      setRewindLaunching(true);
      await syncLocalEvidenceToBackend();
      if (!config.REWIND_APP_URL) {
        throw new Error(copy.missingRewindUrl);
      }
      const rewindReachable = await checkRewindReachable();
      if (!rewindReachable) {
        message.warning(copy.rewindUnavailable);
        writeGameWindowStatus(
          gameWindow,
          'Still opening simulation-test...',
          'The quick availability check was slow, so RewindAI is continuing with the account handoff instead of dropping you into an anonymous session.',
        );
      }
      const handoff = await fetchSimulationTestHandoff();
      const encoded = encodeURIComponent(encodeGrounding(handoff));
      const rewindUrl = `${config.REWIND_APP_URL}?handoff=${encoded}&lang=${language}`;
      if (gameWindow && !gameWindow.closed) {
        gameWindow.location.href = rewindUrl;
      } else {
        window.open(rewindUrl, '_blank');
      }
    } catch (error) {
      writeGameWindowStatus(
        gameWindow,
        'Could not open simulation-test',
        `RewindAI could not create the account handoff. Please return to the cockpit and try again. ${(error as Error).message}`,
      );
      message.error(copy.errors.rewind + (error as Error).message);
    } finally {
      setRewindLaunching(false);
    }
  };

  const handleRebuildFormulation = async () => {
    if (!requireLogin()) return;
    await syncLocalEvidenceToBackend();
    const localBiography = userId ? getLocalEvidencePayload(userId).biography : null;
    if (!biographyAvailable && !hasBiographyContent(localBiography) && !graphAvailable && !traceAvailable) {
      message.info(copy.needsGrounding);
      return;
    }

    try {
      setFormulationRebuilding(true);
      const response = await apiClient('FORMULATION_REBUILD', { method: 'POST' });
      setFormulation(response.data);
      message.success(copy.modelRebuilt);
    } catch (error) {
      message.error(copy.errors.model + (error as Error).message);
    } finally {
      setFormulationRebuilding(false);
    }
  };

  const handleSubmitExperienceFeedback = async () => {
    if (!requireLogin()) return;
    const feedback = experienceFeedback.trim();
    if (!feedback) {
      message.info(copy.feedbackRequired);
      return;
    }
    try {
      setFeedbackSaving(true);
      await apiClient('EXPERIENCE_FEEDBACK', {
        method: 'POST',
        timeoutMs: 12000,
        body: JSON.stringify({
          feedback,
          rating: experienceRating || undefined,
          page_context: 'anonymous_home',
        }),
      });
      setExperienceFeedback('');
      setExperienceRating(0);
      message.success(copy.feedbackSaved);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleBuildUnderstandingLayer = async () => {
    await handleGenerateGraph();
    await handleRebuildFormulation();
  };

  const openContrastReflectionChat = () => {
    if (!traceAvailable) {
      message.info(copy.contrastChatEmptyTrace);
    }
    setContrastChatOpen(true);
    setContrastChatMessages(current => (
      current.length
        ? current
        : [{ role: 'assistant', content: copy.contrastChatStarter }]
    ));
  };

  const openCloneReflectionChat = () => {
    if (!traceAvailable && studyGroup === 'experiment') {
      message.info(copy.cloneChatEmptyTrace);
    }
    if (formulation?.status !== 'ready') {
      message.info(copy.cloneChatNeedsModel);
    }
    setCloneChatOpen(true);
    setCloneChatMessages(current => (
      current.length
        ? current
        : [{ role: 'assistant', content: isAnonymousExperience ? copy.anonymousCloneChatStarter : copy.cloneChatStarter }]
    ));
  };

  const handleSendContrastChat = async () => {
    const content = contrastChatInput.trim();
    if (!content || contrastChatSending) return;
    const nextMessages: GeneralReflectionChatMessage[] = [
      ...contrastChatMessages,
      { role: 'user', content },
    ];
    setContrastChatMessages(nextMessages);
    setContrastChatInput('');
    setContrastChatSending(true);
    try {
      const response = await apiClient('SIMULATION_GENERAL_REFLECTION_CHAT', {
        method: 'POST',
        timeoutMs: 30000,
        body: JSON.stringify({
          language,
          messages: nextMessages.slice(-10),
        }),
      });
      setContrastChatMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: response.reply || copy.contrastChatStarter,
        },
      ]);
    } catch (error) {
      message.error(getErrorMessage(error, language === 'zh' ? '通用 AI 反思调用失败。' : 'General AI reflection failed.'));
      setContrastChatMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: language === 'zh'
            ? '刚刚调用失败了。可以稍后再试，或者先写下你第二轮想调整的一条策略。'
            : 'That call failed. Please try again, or write one strategy you want to adjust in the second run.',
        },
      ]);
    } finally {
      setContrastChatSending(false);
    }
  };

  const handleSendCloneChat = async () => {
    const content = cloneChatInput.trim();
    if (!content || cloneChatSending) return;
    const nextMessages: GeneralReflectionChatMessage[] = [
      ...cloneChatMessages,
      { role: 'user', content },
    ];
    setCloneChatMessages(nextMessages);
    setCloneChatInput('');
    setCloneChatSending(true);
    try {
      const response = await apiClient('SIMULATION_CLONE_REFLECTION_CHAT', {
        method: 'POST',
        timeoutMs: 35000,
        body: JSON.stringify({
          language,
          messages: nextMessages.slice(-10),
        }),
      });
      setCloneChatMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: response.reply || copy.cloneChatStarter,
        },
      ]);
    } catch (error) {
      message.error(getErrorMessage(error, language === 'zh' ? 'Clone 反思调用失败。' : 'Clone reflection failed.'));
      setCloneChatMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: language === 'zh'
            ? '刚刚 clone 反思调用失败了。你可以稍后再试，或者先写下一个第二轮想测试的小改变。'
            : 'The clone reflection call failed. Please try again, or write one small change you want to test in round two.',
        },
      ]);
    } finally {
      setCloneChatSending(false);
    }
  };

  const guideStatuses: Record<string, boolean> = {
    interview: interviewAvailable,
    graph: graphAvailable,
    model: formulation?.status === 'ready',
    simulation: traceAvailable,
    reflection: traceAvailable,
    generalReflection: traceAvailable,
    cloneReflection: cloneChatMessages.some(item => item.role === 'assistant') && cloneChatMessages.length > 1,
    replay: traceSummary ? traceSummary.trace_count >= 2 : false,
  };

  const activeWorkflow = copy.groupWorkflows[studyGroup];
  const currentGuideKey = activeWorkflow.find(step => (
    !guideStatuses[step.key]
  ))?.key || activeWorkflow[activeWorkflow.length - 1].key;

  const guideActions: Record<string, () => void> = {
    interview: handleStartInterview,
    graph: () => { void handleBuildUnderstandingLayer(); },
    model: handleRebuildFormulation,
    simulation: handleLaunchRewind,
    reflection: () => setBlankReflectionOpen(true),
    generalReflection: openContrastReflectionChat,
    cloneReflection: openCloneReflectionChat,
    replay: handleLaunchRewind,
  };

  const guideIcons: Record<string, React.ReactNode> = {
    interview: <CommentOutlined />,
    graph: <ApartmentOutlined />,
    model: <RadarChartOutlined />,
    simulation: <ExperimentOutlined />,
    reflection: <FileTextOutlined />,
    generalReflection: <FileTextOutlined />,
    cloneReflection: <CommentOutlined />,
    replay: <PlayCircleOutlined />,
  };
  const cloneBoundaryMessage = isAnonymousExperience
    ? copy.anonymousCloneChatBoundary
    : copy.cloneChatBoundary;

  return (
    <main className="storysage-cockpit h-screen overflow-y-auto">
      <section className="storysage-cockpit-hero">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Space size="small" className="mb-3">
                <Tag color="gold">{copy.tags[0]}</Tag>
                <Tag color="cyan">{copy.tags[1]}</Tag>
              </Space>
              <Title level={1} className="!mb-3 !text-4xl !font-semibold">
                {copy.title}
              </Title>
              <Paragraph className="!mb-0 max-w-2xl !text-base !leading-7 !text-[#575047]">
                {copy.subtitle}
              </Paragraph>
            </div>

            <Space wrap className="storysage-cockpit-actions">
              {usesPersonalModel && (
                <>
                  <Button
                    type="primary"
                    size="large"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStartInterview}
                  >
                    {copy.startInterview}
                  </Button>
                  <Button
                    size="large"
                    icon={<FileTextOutlined />}
                    onClick={handleOpenBiography}
                  >
                    {copy.biography}
                  </Button>
                  <Button
                    size="large"
                    icon={<CloudSyncOutlined />}
                    loading={graphSyncing || formulationRebuilding}
                    onClick={() => { void handleBuildUnderstandingLayer(); }}
                  >
                    {copy.generateGraph}
                  </Button>
                  <Button
                    size="large"
                    icon={<NodeIndexOutlined />}
                    onClick={handleShowGraph}
                  >
                    {copy.showGraph}
                  </Button>
                </>
              )}
              <Button
                type={usesPersonalModel ? 'default' : 'primary'}
                size="large"
                icon={<ExperimentOutlined />}
                loading={rewindLaunching}
                onClick={handleLaunchRewind}
              >
                {isAnonymousExperience ? copy.launchExperience : copy.launchRewind}
              </Button>
            </Space>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pt-6">
        {(graphServiceUnavailable || demoStorageActive) && (
          <Space direction="vertical" className="mb-4 w-full" size="small">
            {graphServiceUnavailable && (
              <Alert
                showIcon
                type="warning"
                message={copy.graphServiceWarning}
              />
            )}
            {demoStorageActive && (
              <Alert
                showIcon
                type="info"
                message={copy.demoStorageWarning}
              />
            )}
          </Space>
        )}
        <div className="storysage-guide-card">
          <div className="storysage-guide-intro">
            <InfoCircleOutlined />
            <div>
              <Title level={3} className="!mb-1">
                {isAnonymousExperience ? copy.anonymousGuideTitle : copy.guideTitle}
              </Title>
              <Text className="text-[#675f55]">
                {isAnonymousExperience ? copy.anonymousGuideSubtitle : copy.guideSubtitle}
              </Text>
              <div className="storysage-group-chip">
                <span>{copy.groupLabel}</span>
                <strong>{copy.groupDescriptions[studyGroup]}</strong>
              </div>
            </div>
          </div>

          {isAnonymousExperience && (
            <div className="storysage-anonymous-note">
              <div>
                <Text strong>{copy.anonymousModeTitle}</Text>
                <Paragraph className="!mb-0 !mt-1 !text-sm !leading-6 !text-[#675f55]">
                  {copy.anonymousModeDetail}
                </Paragraph>
              </div>
              <Space size="small" wrap>
                {copy.anonymousModeBullets.map(item => (
                  <Tag key={item} color="green">{item}</Tag>
                ))}
              </Space>
            </div>
          )}

          <div className={[
            'storysage-guide-grid',
            isAnonymousExperience ? 'storysage-guide-grid-experience' : '',
          ].filter(Boolean).join(' ')}
          >
            {activeWorkflow.map((step, index) => {
              const isDone = guideStatuses[step.key];
              const isCurrent = currentGuideKey === step.key;
              const statusLabel = isAnonymousExperience
                ? step.eyebrow
                : isDone
                  ? copy.completed
                  : isCurrent
                    ? copy.nextStep
                    : copy.waiting;
              return (
                <Tooltip
                  key={step.key}
                  placement="top"
                  title={step.key === 'graph' && graphServiceUnavailable ? copy.graphServiceWarning : step.hover}
                >
                  <div
                    className={[
                      'storysage-guide-step',
                      isAnonymousExperience ? 'storysage-guide-step-experience' : '',
                      isDone ? 'storysage-guide-step-done' : '',
                      isCurrent ? 'storysage-guide-step-current' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="storysage-guide-step-top">
                      <span className="storysage-guide-icon">
                        {isDone ? <CheckCircleOutlined /> : guideIcons[step.key]}
                      </span>
                      <Tag color={isDone ? 'success' : isCurrent ? 'green' : 'default'}>
                        {statusLabel}
                      </Tag>
                    </div>
                    {!isAnonymousExperience && <div className="storysage-guide-number">{index + 1}</div>}
                    <Text className="storysage-guide-eyebrow">{step.eyebrow}</Text>
                    <Title level={4} className="!mb-2 !mt-1">
                      {step.title}
                    </Title>
                    <Paragraph className="!mb-4 !text-sm !leading-6 !text-[#675f55]">
                      {step.key === 'graph' && graphServiceUnavailable ? copy.graphStepUnavailableDetail : step.detail}
                    </Paragraph>
                    <Button
                      type={(isAnonymousExperience || (isCurrent && !isDone)) ? 'primary' : 'default'}
                      size="small"
                      onClick={guideActions[step.key]}
                    >
                      {step.button}
                    </Button>
                  </div>
                </Tooltip>
              );
            })}

          </div>
        </div>
      </section>

      <Modal
        title={copy.contrastChatTitle}
        open={contrastChatOpen}
        onCancel={() => setContrastChatOpen(false)}
        footer={null}
        width={760}
      >
        <Alert
          showIcon
          type="info"
          className="!mb-4"
          message={copy.contrastChatBoundary}
        />
        <div className="storysage-contrast-chat-log">
          {contrastChatMessages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`storysage-contrast-chat-message storysage-contrast-chat-message-${item.role}`}
            >
              <Text>{item.content}</Text>
            </div>
          ))}
          {contrastChatSending && (
            <div className="storysage-contrast-chat-message storysage-contrast-chat-message-assistant">
              <Text type="secondary">...</Text>
            </div>
          )}
        </div>
        <div className="storysage-contrast-chat-input">
          <Input.TextArea
            rows={3}
            value={contrastChatInput}
            placeholder={copy.contrastChatPlaceholder}
            onChange={event => setContrastChatInput(event.target.value)}
            onPressEnter={event => {
              if (!event.shiftKey) {
                event.preventDefault();
                void handleSendContrastChat();
              }
            }}
          />
          <Button
            type="primary"
            loading={contrastChatSending}
            disabled={!contrastChatInput.trim()}
            onClick={handleSendContrastChat}
          >
            {copy.contrastChatSend}
          </Button>
        </div>
      </Modal>

      <Modal
        title={copy.cloneChatTitle}
        open={cloneChatOpen}
        onCancel={() => setCloneChatOpen(false)}
        footer={null}
        width={760}
      >
        <Alert
          showIcon
          type="success"
          className="!mb-4"
          message={cloneBoundaryMessage}
        />
        <div
          className={[
            'storysage-clone-trace-signal',
            traceAvailable ? 'storysage-clone-trace-signal-active' : '',
          ].filter(Boolean).join(' ')}
        >
          <span className="storysage-clone-trace-dot" />
          <Text strong>
            {traceAvailable ? copy.cloneTraceSignalOn : copy.cloneTraceSignalOff}
          </Text>
        </div>
        {!traceAvailable && studyGroup === 'experiment' && (
          <Alert
            showIcon
            type="warning"
            className="!mb-4"
            message={copy.cloneChatEmptyTrace}
          />
        )}
        {formulation?.status !== 'ready' && (
          <Alert
            showIcon
            type="info"
            className="!mb-4"
            message={copy.cloneChatNeedsModel}
          />
        )}
        <div className="storysage-contrast-chat-log">
          {cloneChatMessages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`storysage-contrast-chat-message storysage-contrast-chat-message-${item.role}`}
            >
              <Text>{item.content}</Text>
            </div>
          ))}
          {cloneChatSending && (
            <div className="storysage-contrast-chat-message storysage-contrast-chat-message-assistant">
              <Text type="secondary">...</Text>
            </div>
          )}
        </div>
        <div className="storysage-contrast-chat-input">
          <Input.TextArea
            rows={3}
            value={cloneChatInput}
            placeholder={copy.cloneChatPlaceholder}
            onChange={event => setCloneChatInput(event.target.value)}
            onPressEnter={event => {
              if (!event.shiftKey) {
                event.preventDefault();
                void handleSendCloneChat();
              }
            }}
          />
          <Button
            type="primary"
            loading={cloneChatSending}
            disabled={!cloneChatInput.trim()}
            onClick={handleSendCloneChat}
          >
            {copy.contrastChatSend}
          </Button>
        </div>
      </Modal>

      {studyGroup === 'blank' && blankReflectionOpen && (
        <section className="mx-auto max-w-7xl px-6 pt-6">
          <div className="storysage-blank-reflection-card">
            <div className="storysage-blank-reflection-copy">
              <Tag color="green">{copy.blankReflectionOpen}</Tag>
              <Title level={3} className="!mb-1">
                {copy.blankReflectionTitle}
              </Title>
              <Paragraph className="!mb-0 !text-sm !leading-6 !text-[#675f55]">
                {copy.blankReflectionDetail}
              </Paragraph>
            </div>
            <Alert
              showIcon
              type="info"
              className="!mb-4"
              message={copy.blankReflectionPrivacy}
            />
            <Input.TextArea
              rows={6}
              value={blankReflectionDraft}
              placeholder={copy.blankReflectionPlaceholder}
              onChange={event => setBlankReflectionDraft(event.target.value)}
            />
            <div className="storysage-blank-reflection-actions">
              <Text className="text-[#675f55]">{copy.blankReflectionReady}</Text>
              <Space wrap>
                <Button onClick={() => setBlankReflectionDraft('')}>
                  {copy.blankReflectionClear}
                </Button>
                <Button
                  type="primary"
                  icon={<ExperimentOutlined />}
                  onClick={handleLaunchRewind}
                >
                  {copy.launchRewind}
                </Button>
              </Space>
            </div>
          </div>
        </section>
      )}

      {isAnonymousExperience && (
        <section className="mx-auto max-w-7xl px-6 pt-6">
          <div className="storysage-cockpit-card p-5">
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <Title level={3} className="!mb-1">
                  {copy.feedbackTitle}
                </Title>
                <Paragraph className="!mb-0 !text-sm !text-[#675f55]">
                  {copy.feedbackDetail}
                </Paragraph>
              </div>
              <div>
                <Text className="mr-3 text-[#675f55]">{copy.feedbackRating}</Text>
                <Rate value={experienceRating} onChange={setExperienceRating} />
              </div>
            </div>
            <Input.TextArea
              rows={4}
              maxLength={3000}
              showCount
              value={experienceFeedback}
              placeholder={copy.feedbackPlaceholder}
              onChange={event => setExperienceFeedback(event.target.value)}
            />
            <Button
              className="mt-3"
              type="primary"
              loading={feedbackSaving}
              onClick={handleSubmitExperienceFeedback}
            >
              {copy.feedbackSubmit}
            </Button>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-6 py-6">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={7}>
            <div className="storysage-cockpit-card storysage-cockpit-card-participant h-full p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <Text className="text-xs uppercase tracking-wider text-[#7a7165]">
                    {copy.participant}
                  </Text>
                  <Title level={3} className="!mb-0 !mt-1">
                    {userId || copy.notSignedIn}
                  </Title>
                </div>
                <DashboardOutlined className="text-2xl text-[#0f766e]" />
              </div>

              <Row gutter={12}>
                <Col span={12}>
                  <Statistic title={copy.dataSources} value={dataSourceCount} />
                </Col>
                <Col span={12}>
                  <Statistic title={copy.traceDecisions} value={traceSummary?.decision_count ?? 0} />
                </Col>
              </Row>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <Text strong>{copy.graphSync}</Text>
                  <Tag color={graphState?.fallback ? 'gold' : graphTone}>
                    {graphState?.fallback ? 'draft fallback' : graphStatus}
                  </Tag>
                </div>
                <Progress
                  percent={Math.min(100, Math.max(0, graphProgress))}
                  status={graphStatus === 'failed' ? 'exception' : undefined}
                  strokeColor="#0f766e"
                />
                <Paragraph className="!mt-3 !mb-0 !text-sm !text-[#675f55]">
                  {graphState?.message || (graphServiceUnavailable ? copy.graphServiceUnavailable : copy.graphEmpty)}
                </Paragraph>
                {(graphState?.node_count || graphState?.edge_count) && (
                  <Space wrap className="mt-2">
                    <Tag color="green">{graphState.node_count ?? 0} nodes</Tag>
                    <Tag color="blue">{graphState.edge_count ?? 0} edges</Tag>
                    {graphState.fallback && <Tag color="gold">relationship/decision draft</Tag>}
                  </Space>
                )}
                {graphState?.error && (
                  <Alert className="mt-3" type="error" message={graphState.error} />
                )}
                <Button
                  className="mt-4"
                  icon={<ReloadOutlined />}
                  loading={graphLoading || traceLoading}
                  onClick={() => {
                    fetchInterviewEvidence();
                    fetchGraphState();
                    fetchTraceSummary();
                    if (usesPersonalModel) {
                      fetchFormulation();
                    }
                  }}
                >
                  {copy.refreshState}
                </Button>
              </div>
            </div>
          </Col>

          <Col xs={24} lg={10}>
            <div className="storysage-cockpit-card storysage-cockpit-card-readiness h-full p-5">
              <div className="mb-5 flex items-center gap-3">
                <RadarChartOutlined className="text-2xl text-[#4338ca]" />
                <div>
                  <Title level={3} className="!mb-0">
                    {copy.groundingReadiness}
                  </Title>
                  <Text className="text-[#675f55]">
                    {copy.groundingDescription}
                  </Text>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {dimensions.map(dimension => (
                  <div
                    key={dimension.label}
                    className="storysage-cockpit-panel p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <Text strong>{dimension.label}</Text>
                      <Text className="text-[#675f55]">{dimension.value}%</Text>
                    </div>
                    <Progress
                      percent={dimension.value}
                      showInfo={false}
                      strokeColor={dimension.color}
                    />
                  </div>
                ))}
              </div>
              <div className="storysage-cockpit-panel mt-4 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Text strong>{copy.behavioralTraceGrounding}</Text>
                  <Space size="small" wrap>
                    <Tag color={traceSummary?.available ? 'success' : 'default'}>
                      {traceSummary?.available ? copy.runCount(traceSummary.trace_count) : copy.noTracesYet}
                    </Tag>
                    <Tag color={traceSummary?.available ? 'blue' : 'default'}>
                      {copy.decisionCount(traceSummary?.decision_count ?? 0)}
                    </Tag>
                  </Space>
                </div>
                <Paragraph className="!mb-0 !text-sm !text-[#675f55]">
                  {traceSummary?.available ? traceSummary.summary : copy.traceEmpty}
                </Paragraph>
                <Paragraph className="!mb-0 !mt-2 !text-xs !text-[#675f55]">
                  {copy.traceEvidenceNote}
                </Paragraph>
                {traceSummary?.privacy_signals?.available && (
                  <Paragraph className="!mb-0 !mt-2 !text-xs !text-[#675f55]">
                    {copy.tracePrivacyPrefix} {traceSummary.privacy_signals.risk_level} risk,
                    {' '}{traceSummary.privacy_signals.labels.length} {copy.tracePrivacySuffix}
                    {traceSummary.privacy_signals.review_required
                      ? ` ${copy.traceReviewRequired}`
                      : ` ${copy.traceReviewClear}`}
                  </Paragraph>
                )}
              </div>
              {usesPersonalModel && (
                <div className="storysage-cockpit-panel mt-4 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Text strong>{copy.formulationTitle}</Text>
                    <Space size="small">
                      <Tag color={formulation?.status === 'ready' ? 'success' : formulation?.stale ? 'orange' : 'gold'}>
                        {formulation?.status || copy.notBuilt}
                      </Tag>
                      <Tag>{formulation?.confidence || copy.unknown}</Tag>
                    </Space>
                  </div>
                  <Paragraph className="!mb-3 !text-sm !text-[#675f55]">
                    {formulation?.formulation.decision_policy_hypotheses?.[0]
                      || copy.formulationEmpty}
                  </Paragraph>
                  {Boolean(formulation?.gaps?.length) && (
                    <Paragraph className="!mb-3 !text-xs !text-[#8a5a15]">
                      {copy.gap} {formulation?.gaps[0]}
                    </Paragraph>
                  )}
                  {formulation?.stale && formulation.stale_reason && (
                    <Paragraph className="!mb-3 !text-xs !text-[#9a3412]">
                      {copy.stale} {formulation.stale_reason}
                    </Paragraph>
                  )}
                  {formulation?.evidence.privacy_signals?.available && (
                    <Paragraph className="!mb-3 !text-xs !text-[#675f55]">
                      {copy.privacyBoundary} {formulation.evidence.privacy_signals.risk_level} risk,
                      {' '}{formulation.evidence.privacy_signals.labels.length} {copy.tracePrivacySuffix}
                      {formulation.evidence.privacy_signals.review_required
                        ? ` ${copy.formulationReviewRequired}`
                        : ` ${copy.formulationReviewClear}`}
                    </Paragraph>
                  )}
                  <Button
                    size="small"
                    loading={formulationLoading || formulationRebuilding}
                    onClick={handleRebuildFormulation}
                  >
                    {copy.buildModel}
                  </Button>
                </div>
              )}
            </div>
          </Col>

          <Col xs={24} lg={7}>
            <div className="storysage-cockpit-card storysage-cockpit-card-flow h-full p-5">
              <div className="mb-5 flex items-center gap-3">
                <BranchesOutlined className="text-2xl text-[#b45309]" />
                <div>
                  <Title level={3} className="!mb-0">
                    {copy.demoFlow}
                  </Title>
                  <Text className="text-[#675f55]">{copy.currentWiring}</Text>
                </div>
              </div>
              <Timeline
                items={[
                  {
                    dot: <CommentOutlined />,
                    children: copy.flowItems[0],
                  },
                  {
                    dot: <ProfileOutlined />,
                    children: copy.flowItems[1],
                  },
                  {
                    dot: <ApartmentOutlined />,
                    children: copy.flowItems[2],
                  },
                  {
                    dot: <FundProjectionScreenOutlined />,
                    children: copy.flowItems[3],
                  },
                ]}
              />
            </div>
          </Col>
        </Row>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <div className="storysage-cockpit-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <ExperimentOutlined className="text-2xl text-[#0f766e]" />
                <Title level={3} className="!mb-0">
                  {copy.groundingTracks}
                </Title>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {copy.sourceTracks.map(track => (
                  <div
                    key={track.title}
                    className="storysage-cockpit-panel flex items-start justify-between p-4"
                  >
                    <div>
                      <Text strong>{track.title}</Text>
                      <Paragraph className="!mb-0 !mt-1 !text-sm !text-[#675f55]">
                        {track.detail}
                      </Paragraph>
                    </div>
                    <Tag>{track.tag}</Tag>
                  </div>
                ))}
              </div>
            </div>
          </Col>

          <Col xs={24} lg={12}>
            <div className="storysage-cockpit-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <ClockCircleOutlined className="text-2xl text-[#be123c]" />
                <Title level={3} className="!mb-0">
                  {copy.representationModes}
                </Title>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {copy.memoryModes.map(mode => (
                  <div
                    key={mode.title}
                    className="storysage-cockpit-panel p-4"
                  >
                    <Text strong>{mode.title}</Text>
                    <Paragraph className="!mb-0 !mt-2 !text-sm !text-[#675f55]">
                      {mode.text}
                    </Paragraph>
                  </div>
                ))}
              </div>
            </div>
          </Col>
        </Row>
      </section>
    </main>
  );
};

export default Home;
