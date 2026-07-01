import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Popconfirm, Progress, Segmented, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import config, { getApiUrl } from '../../config';

const { Paragraph, Text, Title } = Typography;

interface RecentRun {
  source: string;
  session_id?: string;
  received_at?: string;
  decisions: number;
  ended: boolean;
  has_reflection: boolean;
  reflection_type?: string;
  has_self_reflection?: boolean;
  has_general_reflection?: boolean;
  clone_similarity_percent?: number;
  clone_matched_choices?: number;
  clone_total_questions?: number;
  clone_mismatch_categories?: Record<string, number | Record<string, number>>;
  final_meters?: Record<string, number>;
  lowest_meter?: number;
  ending?: string;
  recent_cards: Array<{
    card_id?: string;
    card_domain?: string;
    card_prompt?: string;
    decision_type?: string;
    risk_level?: string;
    target_meter?: string;
    direction?: string;
    choice?: string;
    outcome?: string;
    effects?: Record<string, number>;
    failure_modes?: string[];
  }>;
  avg_response_time_sec?: number | null;
  high_risk_count?: number;
  negative_impact?: number;
  negative_per_decision?: number;
  language?: string;
  run_number?: number;
}

interface FeedbackNote {
  id: string;
  rating?: number;
  page_context?: string;
  feedback: string;
  created_at?: string;
}

interface ParticipantRow {
  user_id: string;
  study_group: string;
  created_at?: string;
  interview_sessions: number;
  interview_messages: number;
  simulation_runs: number;
  simulation_decisions: number;
  latest_clone_similarity_percent?: number;
  collection_stage?: string;
  experience_feedback_count?: number;
  recent_feedback?: FeedbackNote[];
  collection_event_count?: number;
  recent_runs: RecentRun[];
}

interface DataCoverageItem {
  key: string;
  label: string;
  status: string;
  source: string;
  notes: string;
}

interface AdminSummary {
  participants?: number;
  group_counts?: Record<string, number>;
  stage_counts?: Record<string, number>;
  simulation_runs?: number;
  simulation_decisions?: number;
  interview_messages?: number;
  experience_feedback_count?: number;
  anonymous_feedback_count?: number;
  analysis?: {
    group_completion_rates?: Record<string, number>;
    group_reflection_rates?: Record<string, number>;
    clone_similarity?: {
      count?: number;
      average_percent?: number | null;
      min_percent?: number | null;
      max_percent?: number | null;
    };
    average_negative_per_decision?: number | null;
    average_high_risk_rate?: number | null;
    top_clone_mismatch_categories?: Array<{ key: string; count: number }>;
    top_decision_types?: Array<{ key: string; count: number }>;
    risk_level_distribution?: Array<{ key: string; count: number }>;
    top_failure_modes?: Array<{ key: string; count: number }>;
    top_target_meters?: Array<{ key: string; count: number }>;
  };
  data_collection?: {
    event_count?: number;
    event_types?: Array<{ key: string; count: number }>;
    categories?: Array<{ key: string; count: number }>;
    groups?: Array<{ key: string; count: number }>;
    privacy_risk_levels?: Array<{ key: string; count: number }>;
    coverage?: DataCoverageItem[];
    recommendation?: string;
  };
}

interface RuntimeHealth {
  runtime?: {
    database?: {
      sqlite?: boolean;
    };
    storage?: {
      data_dir?: string;
    };
    mirofish?: {
      graph_sync_enabled?: boolean;
      base_url_is_local?: boolean;
    };
  };
}

const tokenStorageKey = 'rewindai.admin.token';

type AdminLang = 'en' | 'zh';

const adminCopy = {
  en: {
    title: 'Study collection dashboard.',
    subtitle: 'Track group assignment, interview activity, simulation-test trace return, reflection status, and clone similarity. This page avoids raw interview text.',
    load: 'Load records',
    token: 'Admin token',
    privacyTitle: 'Privacy boundary',
    privacyDesc: 'This page summarizes compact study metadata. Use deletion controls to clean test data before formal collection.',
    participants: 'Participants',
    simulationRuns: 'Simulation runs',
    traceDecisions: 'Trace decisions',
    interviewMessages: 'Interview messages',
    feedback: 'Experience feedback',
    anonFeedback: 'Anonymous feedback',
    collectionEvents: 'Collection events',
    records: 'Latest loaded records',
    notLoaded: 'Not loaded yet',
    search: 'Search user id',
    allGroups: 'All groups',
    exportCsv: 'Export CSV',
    exportJson: 'Export JSON',
    clearAll: 'Clear all test data',
    clearAllPrompt: 'Type REWINDAI_CLEAR_ALL to delete all participants, sessions, traces, feedback, and collection events.',
    clearAllDone: 'All test data cleared',
    deleteUser: 'Delete user',
    deleteRun: 'Delete run',
    confirmDeleteUser: 'Delete this participant and all associated test records?',
    confirmDeleteRun: 'Delete this simulation run?',
    actions: 'Actions',
    recentFeedback: 'Recent feedback',
    noFeedback: 'No feedback notes',
    richerRun: 'Detailed simulation-test metadata',
    loaded: 'Loaded',
  },
  zh: {
    title: '研究数据收集后台',
    subtitle: '查看分组、访谈活动、simulation-test 轨迹回流、反思状态和 clone 相似度。本页默认不展示原始访谈文本。',
    load: '加载记录',
    token: '管理员 token',
    privacyTitle: '隐私边界',
    privacyDesc: '这里汇总的是紧凑研究元数据。正式收集前，可以用删除功能清理测试数据。',
    participants: '参与者',
    simulationRuns: '游戏轮次',
    traceDecisions: '决策记录',
    interviewMessages: '访谈消息',
    feedback: '体验反馈',
    anonFeedback: '匿名反馈',
    collectionEvents: '采集事件',
    records: '最新加载记录',
    notLoaded: '尚未加载',
    search: '搜索用户 ID',
    allGroups: '全部分组',
    exportCsv: '导出 CSV',
    exportJson: '导出 JSON',
    clearAll: '清空全部测试数据',
    clearAllPrompt: '请输入 REWINDAI_CLEAR_ALL 以删除所有参与者、访谈、游戏轨迹、反馈和采集事件。',
    clearAllDone: '全部测试数据已清空',
    deleteUser: '删除用户',
    deleteRun: '删除本次',
    confirmDeleteUser: '确认删除该参与者和所有关联测试记录？',
    confirmDeleteRun: '确认删除这一次 simulation-test 记录？',
    actions: '操作',
    recentFeedback: '最近反馈',
    noFeedback: '暂无反馈',
    richerRun: '详细 simulation-test 元数据',
    loaded: '已加载',
  },
} satisfies Record<AdminLang, Record<string, string>>;

const groupLabels: Record<string, string> = {
  blank: 'Group 1',
  contrast: 'Group 2',
  experiment: 'Group 3',
  anonymous: 'Anonymous Group',
};

const stageLabels: Record<string, string> = {
  needs_interview: 'Needs interview',
  needs_first_game: 'Needs first game',
  needs_self_reflection: 'Needs self reflection',
  needs_general_reflection: 'Needs general reflection',
  needs_clone_reflection: 'Needs clone reflection',
  ready_for_second_game: 'Ready for / has second run',
  anonymous_experience: 'Anonymous experience',
};

function formatRate(value?: number) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'N/A';
}

function AnalysisTags({ items, empty = 'No data yet' }: { items?: Array<{ key: string; count: number }>; empty?: string }) {
  if (!items?.length) {
    return <Text type="secondary">{empty}</Text>;
  }
  return (
    <Space wrap>
      {items.slice(0, 8).map(item => (
        <Tag key={item.key}>{item.key}: {item.count}</Tag>
      ))}
    </Space>
  );
}

function coverageColor(status: string) {
  if (status === 'collected') return 'green';
  if (status === 'partial') return 'gold';
  if (status === 'derived_later') return 'blue';
  if (status === 'defer') return 'red';
  return 'default';
}

function flattenMismatchCategories(categories?: RecentRun['clone_mismatch_categories']) {
  if (!categories) return [];
  return Object.entries(categories).flatMap(([group, value]) => {
    if (typeof value === 'number') {
      return [{ key: group, count: value }];
    }
    return Object.entries(value || {}).map(([key, count]) => ({
      key: `${group}:${key}`,
      count,
    }));
  });
}

function downloadCsv(rows: ParticipantRow[], lang: AdminLang) {
  const headers = lang === 'zh'
    ? ['用户ID', '分组', '阶段', '创建时间', '访谈会话', '访谈消息', '游戏轮次', '决策数', 'clone相似度', '反馈数', '采集事件数']
    : ['user_id', 'group', 'collection_stage', 'created_at', 'interview_sessions', 'interview_messages', 'simulation_runs', 'simulation_decisions', 'latest_clone_similarity_percent', 'experience_feedback_count', 'collection_event_count'];
  const fields = [
    'user_id',
    'study_group',
    'collection_stage',
    'created_at',
    'interview_sessions',
    'interview_messages',
    'simulation_runs',
    'simulation_decisions',
    'latest_clone_similarity_percent',
    'experience_feedback_count',
    'collection_event_count',
  ];
  const csv = [
    headers.join(','),
    ...rows.map(row => fields.map(field => {
      const value = String((row as unknown as Record<string, unknown>)[field] ?? '');
      return `"${value.replace(/"/g, '""')}"`;
    }).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rewindai-admin-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJson(rows: ParticipantRow[], summary: AdminSummary, lang: AdminLang) {
  const blob = new Blob([JSON.stringify({ language: lang, exported_at: new Date().toISOString(), summary, participants: rows }, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rewindai-admin-${lang}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const AdminPage: React.FC = () => {
  const [language, setLanguage] = useState<AdminLang>('zh');
  const [token, setToken] = useState(() => window.localStorage.getItem(tokenStorageKey) || '');
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [summary, setSummary] = useState<AdminSummary>({});
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const t = adminCopy[language];

  const fetchRuntimeHealth = async () => {
    try {
      const healthResponse = await fetch(`${config.API_BASE_URL}/health`);
      if (healthResponse.ok) {
        setHealth(await healthResponse.json());
      }
    } catch {
      // Keep the records table usable even if the health probe is unavailable.
    }
  };

  useEffect(() => {
    void fetchRuntimeHealth();
  }, []);

  const fetchParticipants = async () => {
    if (!token.trim()) {
      message.warning('Please enter the admin token first.');
      return;
    }
    setLoading(true);
    try {
      window.localStorage.setItem(tokenStorageKey, token.trim());
      await fetchRuntimeHealth();
      const response = await fetch(getApiUrl('ADMIN_PARTICIPANTS'), {
        headers: {
          'X-RewindAI-Admin-Token': token.trim(),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || `Admin request failed: ${response.status}`);
      }
      setParticipants(Array.isArray(payload.participants) ? payload.participants : []);
      setSummary(payload.summary || {});
      setLastLoadedAt(new Date().toLocaleString());
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const adminFetch = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(getApiUrl(path), {
      ...options,
      headers: {
        'X-RewindAI-Admin-Token': token.trim(),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || `Admin request failed: ${response.status}`);
    }
    return payload;
  };

  const deleteParticipant = async (userId: string) => {
    try {
      await adminFetch(`/admin/participants/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      message.success(language === 'zh' ? '用户测试数据已删除' : 'Participant test data deleted');
      await fetchParticipants();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const deleteRun = async (row: ParticipantRow, run: RecentRun) => {
    if (!run.session_id) return;
    try {
      await adminFetch(
        `/admin/participants/${encodeURIComponent(row.user_id)}/traces/${encodeURIComponent(run.session_id)}?source=${encodeURIComponent(run.source || 'simulation-test')}`,
        { method: 'DELETE' },
      );
      message.success(language === 'zh' ? '本次记录已删除' : 'Run deleted');
      await fetchParticipants();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const clearAllRecords = async () => {
    const typed = window.prompt(t.clearAllPrompt);
    if (typed !== 'REWINDAI_CLEAR_ALL') {
      message.info(language === 'zh' ? '已取消清空操作' : 'Clear all cancelled');
      return;
    }
    try {
      await adminFetch('/admin/participants?confirm=REWINDAI_CLEAR_ALL', { method: 'DELETE' });
      message.success(t.clearAllDone);
      await fetchParticipants();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<ParticipantRow> = [
    {
      title: language === 'zh' ? '用户' : 'User',
      dataIndex: 'user_id',
      key: 'user_id',
      fixed: 'left',
      render: value => <strong>{value}</strong>,
    },
    {
      title: language === 'zh' ? '分组' : 'Group',
      dataIndex: 'study_group',
      key: 'study_group',
      render: value => <Tag color={value === 'anonymous' ? 'purple' : value === 'experiment' ? 'green' : value === 'contrast' ? 'blue' : 'gold'}>{groupLabels[value] || value}</Tag>,
      filters: [
        { text: 'Group 1', value: 'blank' },
        { text: 'Group 2', value: 'contrast' },
        { text: 'Group 3', value: 'experiment' },
        { text: 'Anonymous Group', value: 'anonymous' },
      ],
      onFilter: (value, row) => row.study_group === value,
    },
    {
      title: language === 'zh' ? '阶段' : 'Stage',
      dataIndex: 'collection_stage',
      key: 'collection_stage',
      render: value => <Tag color={value === 'ready_for_second_game' ? 'green' : 'orange'}>{stageLabels[value] || value || 'unknown'}</Tag>,
    },
    {
      title: language === 'zh' ? '访谈' : 'Interview',
      key: 'interview',
      render: (_, row) => `${row.interview_sessions} session(s), ${row.interview_messages} message(s)`,
    },
    {
      title: language === 'zh' ? '游戏' : 'Simulation',
      key: 'simulation',
      render: (_, row) => `${row.simulation_runs} run(s), ${row.simulation_decisions} decision(s)`,
    },
    {
      title: language === 'zh' ? 'Clone 相似度' : 'Clone similarity',
      key: 'clone_similarity',
      render: (_, row) => typeof row.latest_clone_similarity_percent === 'number'
        ? <Progress percent={row.latest_clone_similarity_percent} size="small" />
        : <span className="text-[#7a887e]">N/A</span>,
    },
    {
      title: language === 'zh' ? '反馈' : 'Feedback',
      key: 'feedback',
      render: (_, row) => row.experience_feedback_count ? `${row.experience_feedback_count} note(s)` : 'none',
    },
    {
      title: language === 'zh' ? '采集事件' : 'Collection events',
      key: 'collection_events',
      render: (_, row) => row.collection_event_count ? `${row.collection_event_count} event(s)` : 'none',
    },
    {
      title: language === 'zh' ? '最近记录' : 'Recent Run',
      key: 'recent',
      render: (_, row) => {
        const run = row.recent_runs?.[0];
        if (!run) return <span className="text-[#7a887e]">No simulation yet</span>;
        return (
          <span>
            {run.decisions} decisions
            {run.has_reflection ? ' · reflected' : ''}
            {run.ending ? ` · ${run.ending}` : ''}
          </span>
        );
      },
    },
    {
      title: language === 'zh' ? '创建时间' : 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: value => value ? new Date(value).toLocaleString() : 'unknown',
    },
    {
      title: t.actions,
      key: 'actions',
      fixed: 'right',
      render: (_, row) => (
        <Popconfirm
          title={t.confirmDeleteUser}
          okText={language === 'zh' ? '删除' : 'Delete'}
          cancelText={language === 'zh' ? '取消' : 'Cancel'}
          okButtonProps={{ danger: true }}
          onConfirm={() => deleteParticipant(row.user_id)}
        >
          <Button danger size="small">{t.deleteUser}</Button>
        </Popconfirm>
      ),
    },
  ];

  const filteredParticipants = participants.filter(row => {
    const matchesGroup = groupFilter === 'all' || row.study_group === groupFilter;
    const matchesQuery = !query.trim() || row.user_id.toLowerCase().includes(query.trim().toLowerCase());
    return matchesGroup && matchesQuery;
  });
  const totalDecisions = summary.simulation_decisions ?? participants.reduce((sum, row) => sum + row.simulation_decisions, 0);
  const totalRuns = summary.simulation_runs ?? participants.reduce((sum, row) => sum + row.simulation_runs, 0);
  const totalInterviewMessages = summary.interview_messages ?? participants.reduce((sum, row) => sum + row.interview_messages, 0);
  const usesEphemeralDatabase = Boolean(health?.runtime?.database?.sqlite);
  const usesLocalMiroFish = Boolean(
    health?.runtime?.mirofish?.base_url_is_local || health?.runtime?.mirofish?.graph_sync_enabled === false,
  );

  return (
    <div className="storysage-cockpit min-h-screen overflow-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="storysage-kicker">RewindAI admin</span>
            <Segmented
              value={language}
              onChange={value => setLanguage(value as AdminLang)}
              options={[
                { label: '中文', value: 'zh' },
                { label: 'EN', value: 'en' },
              ]}
            />
          </div>
          <Title className="storysage-display-title mb-3">{t.title}</Title>
          <Paragraph className="max-w-3xl text-[#5f7167]">
            {t.subtitle}
          </Paragraph>
        </div>

        <Card className="mb-5 rounded-[28px] border-[#cfe2c1]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input.Password
              aria-label="Admin token"
              placeholder={t.token}
              value={token}
              onChange={event => setToken(event.target.value)}
              onPressEnter={fetchParticipants}
              size="large"
            />
            <Button type="primary" loading={loading} onClick={fetchParticipants} size="large">
              {t.load}
            </Button>
            <Button danger onClick={clearAllRecords} size="large" disabled={!token.trim()}>
              {t.clearAll}
            </Button>
          </div>
          <Alert
            className="mt-4"
            type={config.API_BASE_URL.includes('localhost') ? 'warning' : 'info'}
            message={t.privacyTitle}
            description={t.privacyDesc}
            showIcon
          />
          {usesEphemeralDatabase && (
            <Alert
              className="mt-3"
              type="warning"
              message="Ephemeral database runtime"
              description={`The backend is currently using SQLite at ${health?.runtime?.storage?.data_dir || '/tmp'}. Records can disappear after deployment or serverless instance reset. Connect an external Postgres DATABASE_URL before collecting real participants.`}
              showIcon
            />
          )}
          {usesLocalMiroFish && (
            <Alert
              className="mt-3"
              type="warning"
              message="MiroFish native sync is not online"
              description="Graph generation is using StorySage's provisional local graph fallback. This is okay for demo flow, but not the full MiroFish backend graph pipeline."
              showIcon
            />
          )}
        </Card>

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Card><Statistic title={t.participants} value={participants.length} /></Card>
          <Card><Statistic title={t.simulationRuns} value={totalRuns} /></Card>
          <Card><Statistic title={t.traceDecisions} value={totalDecisions} /></Card>
          <Card><Statistic title={t.interviewMessages} value={totalInterviewMessages} /></Card>
          <Card>
            <Statistic title="Group 1 / blank" value={summary.group_counts?.blank ?? participants.filter(row => row.study_group === 'blank').length} />
          </Card>
          <Card>
            <Statistic title="Group 2 / contrast" value={summary.group_counts?.contrast ?? participants.filter(row => row.study_group === 'contrast').length} />
          </Card>
          <Card>
            <Statistic title="Group 3 / experiment" value={summary.group_counts?.experiment ?? participants.filter(row => row.study_group === 'experiment').length} />
          </Card>
          <Card>
            <Statistic title="Anonymous Group" value={summary.group_counts?.anonymous ?? participants.filter(row => row.study_group === 'anonymous').length} />
          </Card>
          <Card>
            <Statistic title={t.feedback} value={summary.experience_feedback_count ?? 0} />
          </Card>
          <Card>
            <Statistic title={t.anonFeedback} value={summary.anonymous_feedback_count ?? 0} />
          </Card>
          <Card>
            <Statistic title={t.collectionEvents} value={summary.data_collection?.event_count ?? 0} />
          </Card>
        </div>

        {summary.stage_counts && (
          <Card className="mb-5 rounded-[28px] border-[#cfe2c1]">
            <strong>Collection stages</strong>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(summary.stage_counts).map(([stage, count]) => (
                <Tag key={stage} color={stage === 'ready_for_second_game' ? 'green' : 'orange'}>
                  {stageLabels[stage] || stage}: {count}
                </Tag>
              ))}
            </div>
          </Card>
        )}

        <Card className="mb-5 rounded-[28px] border-[#cfe2c1]">
          <div className="mb-4">
            <span className="storysage-kicker">Data requirements</span>
            <Title level={3} className="!mb-1">What we should actually collect now</Title>
            <Paragraph className="!mb-0 text-[#5f7167]">
              This maps the PDF requirements to the current demo. The goal is enough evidence for analysis
              without silently adding demographics, extra surveys, raw-text exposure, or new study tasks.
            </Paragraph>
          </div>
          {summary.data_collection?.recommendation && (
            <Alert
              className="mb-4"
              type="info"
              showIcon
              message="Recommended collection boundary"
              description={summary.data_collection.recommendation}
            />
          )}
          <div className="mb-4 grid gap-4 lg:grid-cols-4">
            <Card size="small" title="Event types">
              <AnalysisTags items={summary.data_collection?.event_types} />
            </Card>
            <Card size="small" title="Data categories">
              <AnalysisTags items={summary.data_collection?.categories} />
            </Card>
            <Card size="small" title="Event groups">
              <AnalysisTags items={summary.data_collection?.groups} />
            </Card>
            <Card size="small" title="Privacy risk signals">
              <AnalysisTags items={summary.data_collection?.privacy_risk_levels} empty="No risk events yet" />
            </Card>
          </div>
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={summary.data_collection?.coverage || []}
            columns={[
              {
                title: 'Requirement',
                dataIndex: 'label',
                render: value => <strong>{value}</strong>,
              },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 140,
                render: value => <Tag color={coverageColor(value)}>{value}</Tag>,
              },
              {
                title: 'Current source',
                dataIndex: 'source',
                width: 240,
              },
              {
                title: 'Why',
                dataIndex: 'notes',
              },
            ]}
          />
        </Card>

        <Card className="mb-5 rounded-[28px] border-[#cfe2c1]">
          <div className="mb-4">
            <span className="storysage-kicker">Analysis layer</span>
            <Title level={3} className="!mb-1">Safe aggregate analysis</Title>
            <Paragraph className="!mb-0 text-[#5f7167]">
              These summaries use counts and compact simulation metadata only: no raw interview transcript, no raw biography text.
            </Paragraph>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            <Card size="small">
              <Statistic
                title="Avg clone similarity"
                value={summary.analysis?.clone_similarity?.average_percent ?? 0}
                suffix="%"
                precision={1}
              />
              <Text type="secondary">
                n={summary.analysis?.clone_similarity?.count ?? 0}
                {typeof summary.analysis?.clone_similarity?.min_percent === 'number'
                  ? ` · range ${summary.analysis.clone_similarity.min_percent}-${summary.analysis.clone_similarity.max_percent}%`
                  : ''}
              </Text>
            </Card>
            <Card size="small">
              <Statistic
                title="Avg negative / decision"
                value={summary.analysis?.average_negative_per_decision ?? 0}
                precision={2}
              />
              <Text type="secondary">Lower means fewer resource losses per choice.</Text>
            </Card>
            <Card size="small">
              <Statistic
                title="Avg high-risk rate"
                value={(summary.analysis?.average_high_risk_rate ?? 0) * 100}
                suffix="%"
                precision={1}
              />
              <Text type="secondary">Share of decisions marked high-risk.</Text>
            </Card>
            <Card size="small">
              <strong>Group completion</strong>
              <div className="mt-3 space-y-2">
                {['blank', 'contrast', 'experiment'].map(group => (
                  <div key={group}>
                    <Text>{groupLabels[group]}</Text>
                    <Progress
                      percent={Math.round((summary.analysis?.group_completion_rates?.[group] ?? 0) * 100)}
                      size="small"
                    />
                  </div>
                ))}
              </div>
            </Card>
            <Card size="small">
              <strong>{language === 'zh' ? 'Ablation / 条件对照' : 'Ablation / condition comparison'}</strong>
              <Paragraph className="!mb-3 !mt-2 text-[#5f7167]">
                {language === 'zh'
                  ? 'Group 1=自我反思，Group 2=通用 AI，Group 3=RewindAI clone。'
                  : 'Group 1=self reflection, Group 2=generic AI, Group 3=RewindAI clone.'}
              </Paragraph>
              <Space direction="vertical" className="w-full">
                {['blank', 'contrast', 'experiment'].map(group => (
                  <div key={group} className="flex items-center justify-between gap-3">
                    <Text>{groupLabels[group]}</Text>
                    <Space>
                      <Tag color="blue">
                        {language === 'zh' ? '完成' : 'complete'} {formatRate(summary.analysis?.group_completion_rates?.[group])}
                      </Tag>
                      <Tag color="green">
                        {language === 'zh' ? '反思' : 'reflect'} {formatRate(summary.analysis?.group_reflection_rates?.[group])}
                      </Tag>
                    </Space>
                  </div>
                ))}
              </Space>
            </Card>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card size="small" title="Reflection coverage by group">
              <Space direction="vertical" className="w-full">
                {['blank', 'contrast', 'experiment'].map(group => (
                  <div key={group} className="flex items-center justify-between gap-3">
                    <Text>{groupLabels[group]}</Text>
                    <Tag color="green">{formatRate(summary.analysis?.group_reflection_rates?.[group])}</Tag>
                  </div>
                ))}
              </Space>
            </Card>
            <Card size="small" title="Clone mismatch categories">
              <AnalysisTags items={summary.analysis?.top_clone_mismatch_categories} />
            </Card>
            <Card size="small" title="Common decision types">
              <AnalysisTags items={summary.analysis?.top_decision_types} />
            </Card>
            <Card size="small" title="Risk level distribution">
              <AnalysisTags items={summary.analysis?.risk_level_distribution} />
            </Card>
            <Card size="small" title="Failure modes">
              <AnalysisTags items={summary.analysis?.top_failure_modes} />
            </Card>
            <Card size="small" title="Most affected resources">
              <AnalysisTags items={summary.analysis?.top_target_meters} />
            </Card>
          </div>
        </Card>

        <Card className="rounded-[28px] border-[#cfe2c1]">
          <div className="mb-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <strong>{t.records}</strong>
              <span className="ml-3 text-sm text-[#6f7f74]">{lastLoadedAt ? `${t.loaded} ${lastLoadedAt}` : t.notLoaded}</span>
            </div>
            <Space wrap>
              <Input.Search
                allowClear
                placeholder={t.search}
                value={query}
                onChange={event => setQuery(event.target.value)}
                style={{ width: 220 }}
              />
              <Select
                value={groupFilter}
                onChange={setGroupFilter}
                style={{ width: 150 }}
                options={[
                  { value: 'all', label: t.allGroups },
                  { value: 'blank', label: 'Group 1' },
                  { value: 'contrast', label: 'Group 2' },
                  { value: 'experiment', label: 'Group 3' },
                  { value: 'anonymous', label: 'Anonymous Group' },
                ]}
              />
              <Button onClick={() => downloadCsv(filteredParticipants, language)} disabled={!filteredParticipants.length}>
                {t.exportCsv}
              </Button>
              <Button onClick={() => downloadJson(filteredParticipants, summary, language)} disabled={!filteredParticipants.length}>
                {t.exportJson}
              </Button>
            </Space>
          </div>
          <Table
            rowKey="user_id"
            columns={columns}
            dataSource={filteredParticipants}
            loading={loading}
            scroll={{ x: 1120 }}
            pagination={{ pageSize: 20 }}
            expandable={{
              expandedRowRender: row => (
                <div className="space-y-4">
                  <Text type="secondary">
                    {t.richerRun}
                  </Text>
                  <Card size="small" title={t.recentFeedback}>
                    {row.recent_feedback?.length ? (
                      <Space direction="vertical" className="w-full">
                        {row.recent_feedback.map(feedback => (
                          <div key={feedback.id} className="rounded-xl border border-[#dce8d3] bg-[#fbfdf6] p-3">
                            <Space wrap>
                              {typeof feedback.rating === 'number' && <Tag color="gold">{feedback.rating}/5</Tag>}
                              {feedback.page_context && <Tag>{feedback.page_context}</Tag>}
                              <Text type="secondary">{feedback.created_at ? new Date(feedback.created_at).toLocaleString() : ''}</Text>
                            </Space>
                            <Paragraph className="!mb-0 !mt-2">{feedback.feedback}</Paragraph>
                          </div>
                        ))}
                      </Space>
                    ) : (
                      <Text type="secondary">{t.noFeedback}</Text>
                    )}
                  </Card>
                  <Table
                    rowKey={run => run.session_id || run.received_at || Math.random().toString()}
                    size="small"
                    pagination={false}
                    dataSource={row.recent_runs || []}
                    columns={[
                      {
                        title: language === 'zh' ? '接收时间' : 'Received',
                        dataIndex: 'received_at',
                        render: value => value ? new Date(value).toLocaleString() : 'unknown',
                      },
                      {
                        title: language === 'zh' ? '决策' : 'Decisions',
                        dataIndex: 'decisions',
                      },
                      {
                        title: language === 'zh' ? '反思' : 'Reflection',
                        render: (_, run) => (
                          <Space wrap>
                            {run.has_self_reflection && <Tag>self</Tag>}
                            {run.has_general_reflection && <Tag>general AI</Tag>}
                            {run.has_reflection && <Tag color="green">clone</Tag>}
                            {!run.has_reflection && !run.has_self_reflection && !run.has_general_reflection && <Tag color="default">none</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: language === 'zh' ? 'Clone 相似度' : 'Clone similarity',
                        render: (_, run) => typeof run.clone_similarity_percent === 'number'
                          ? `${run.clone_similarity_percent}% (${run.clone_matched_choices}/${run.clone_total_questions})`
                          : 'N/A',
                      },
                      {
                        title: language === 'zh' ? '运行指标' : 'Run metrics',
                        render: (_, run) => (
                          <Space wrap>
                            <Tag>{language === 'zh' ? '高风险' : 'high risk'}: {run.high_risk_count ?? 0}</Tag>
                            <Tag>{language === 'zh' ? '负面冲击' : 'negative'}: {run.negative_impact ?? 0}</Tag>
                            {typeof run.avg_response_time_sec === 'number' && (
                              <Tag>{language === 'zh' ? '均时' : 'avg'}: {run.avg_response_time_sec}s</Tag>
                            )}
                            {run.language && <Tag>{run.language}</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: language === 'zh' ? '错配类别' : 'Mismatch categories',
                        render: (_, run) => flattenMismatchCategories(run.clone_mismatch_categories).slice(0, 4).map(item => (
                          <Tag key={item.key}>{item.key}: {item.count}</Tag>
                        )),
                      },
                      {
                        title: language === 'zh' ? '最近卡片/类别' : 'Recent cards/categories',
                        render: (_, run) => (run.recent_cards || []).slice(-4).map(card => (
                          <Tag key={`${card.card_id}-${card.direction}`}>
                            {card.card_id} · {card.decision_type || card.card_domain || 'card'}
                          </Tag>
                        )),
                      },
                      {
                        title: t.actions,
                        render: (_, run) => (
                          <Popconfirm
                            title={t.confirmDeleteRun}
                            okText={language === 'zh' ? '删除' : 'Delete'}
                            cancelText={language === 'zh' ? '取消' : 'Cancel'}
                            okButtonProps={{ danger: true }}
                            onConfirm={() => deleteRun(row, run)}
                          >
                            <Button danger size="small" disabled={!run.session_id}>{t.deleteRun}</Button>
                          </Popconfirm>
                        ),
                      },
                    ]}
                    expandable={{
                      expandedRowRender: run => (
                        <div className="space-y-2">
                          {(run.recent_cards || []).map(card => (
                            <div key={`${run.session_id}-${card.card_id}-${card.direction}`} className="rounded-xl border border-[#dce8d3] bg-[#fbfdf6] p-3">
                              <Space wrap>
                                <Tag>{card.card_id}</Tag>
                                {card.risk_level && <Tag color={card.risk_level === 'high' ? 'red' : 'default'}>{card.risk_level}</Tag>}
                                {card.target_meter && <Tag>{card.target_meter}</Tag>}
                                {card.failure_modes?.map(mode => <Tag key={mode}>{mode}</Tag>)}
                              </Space>
                              {card.card_prompt && <Paragraph className="!mb-1 !mt-2">{card.card_prompt}</Paragraph>}
                              <Text type="secondary">{card.direction} · {card.choice} · {card.outcome}</Text>
                            </div>
                          ))}
                        </div>
                      ),
                    }}
                  />
                </div>
              ),
            }}
          />
        </Card>
      </div>
    </div>
  );
};

export default AdminPage;
