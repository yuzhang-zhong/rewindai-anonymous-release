interface Config {
  API_BASE_URL: string;
  REWIND_APP_URL: string;
  API_ENDPOINTS: {
    HEALTH: string;
    MESSAGES: string;
    LOGIN: string;
    REGISTER: string;
    USER_PROFILE: string;
    EVIDENCE_SYNC: string;
    END_SESSION: string;
    PREPARE_END_SESSION: string;
    BIOGRAPHY_LATEST: string;
    BIOGRAPHY_EDIT: string;
    BIOGRAPHY_REWRITE: string;
    BIOGRAPHY_REWRITE_APPLY: string;
    LIKE: string;
    SKIP: string;
    GRAPH_REBUILD: string;
    GRAPH_STATE: string;
    GRAPH_DATA: string;
    GRAPH_VIEW_TOKEN: string;
    SIMULATION_PROFILE: string;
    SIMULATION_TEST_HANDOFF: string;
    SIMULATION_TRACE_SUMMARY: string;
    SIMULATION_GENERAL_REFLECTION_CHAT: string;
    SIMULATION_CLONE_REFLECTION_CHAT: string;
    FORMULATION_CURRENT: string;
    FORMULATION_REBUILD: string;
    MODEL_SETTINGS: string;
    MODEL_SETTINGS_VALIDATE: string;
    ADMIN_PARTICIPANTS: string;
    EXPERIENCE_FEEDBACK: string;
  };
}

const localApiBaseUrl = 'http://localhost:8000';
const localRewindAppUrl = 'http://127.0.0.1:5174';

const config: Config = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? localApiBaseUrl : ''),
  REWIND_APP_URL: import.meta.env.VITE_REWIND_APP_URL || (import.meta.env.DEV ? localRewindAppUrl : ''),
  API_ENDPOINTS: {
    HEALTH: '/health',
    MESSAGES: '/messages',
    LOGIN: '/user/login',
    REGISTER: '/user/register',
    USER_PROFILE: '/user/profile',
    EVIDENCE_SYNC: '/user/evidence-sync',
    END_SESSION: '/sessions/end',
    PREPARE_END_SESSION: '/sessions/prepare-end',
    BIOGRAPHY_LATEST: '/biography/latest',
    BIOGRAPHY_EDIT: '/biography/edit',
    BIOGRAPHY_REWRITE: '/biography/rewrite',
    BIOGRAPHY_REWRITE_APPLY: '/biography/rewrite/apply',
    LIKE: '/like',
    SKIP: '/skip',
    GRAPH_REBUILD: '/graph/public/rebuild',
    GRAPH_STATE: '/graph/public/state',
    GRAPH_DATA: '/graph/public/current/data',
    GRAPH_VIEW_TOKEN: '/graph/public/view-token',
    SIMULATION_PROFILE: '/simulation/profile',
    SIMULATION_TEST_HANDOFF: '/simulation/test-handoff',
    SIMULATION_TRACE_SUMMARY: '/simulation/traces/summary',
    SIMULATION_GENERAL_REFLECTION_CHAT: '/simulation/general-reflection-chat',
    SIMULATION_CLONE_REFLECTION_CHAT: '/simulation/clone-reflection-chat',
    FORMULATION_CURRENT: '/formulation/current',
    FORMULATION_REBUILD: '/formulation/rebuild',
    MODEL_SETTINGS: '/model-settings',
    MODEL_SETTINGS_VALIDATE: '/model-settings/validate',
    ADMIN_PARTICIPANTS: '/admin/participants',
    EXPERIENCE_FEEDBACK: '/experience-feedback',
  },
};

export const getApiUrl = (endpoint: keyof Config['API_ENDPOINTS'] | string) => {
  if (!config.API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is required for deployed StorySage builds.');
  }
  if (endpoint in config.API_ENDPOINTS) {
    const configEndpoint = config.API_ENDPOINTS[endpoint as keyof Config['API_ENDPOINTS']];
    return `${config.API_BASE_URL}${configEndpoint}`;
  }
  return `${config.API_BASE_URL}${endpoint}`;
};

export default config; 
