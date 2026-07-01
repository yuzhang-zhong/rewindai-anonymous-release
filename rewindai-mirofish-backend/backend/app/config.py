"""
配置管理
统一从项目根目录的 .env 文件加载配置
"""

import os
from dotenv import load_dotenv

# 加载项目根目录的 .env 文件
# 路径: MiroFish/.env (相对于 backend/app/config.py)
project_root_env = os.path.join(os.path.dirname(__file__), '../../.env')

if os.path.exists(project_root_env):
    load_dotenv(project_root_env, override=True)
else:
    # 如果根目录没有 .env，尝试加载环境变量（用于生产环境）
    load_dotenv(override=True)


class Config:
    """Flask配置类"""
    
    # Flask配置
    SECRET_KEY = os.environ.get('SECRET_KEY', 'mirofish-secret-key')
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    ENVIRONMENT = os.environ.get('MIROFISH_ENV') or os.environ.get('ENVIRONMENT') or os.environ.get('APP_ENV') or ''
    CORS_ORIGINS = [
        item.strip().rstrip('/')
        for item in os.environ.get('MIROFISH_CORS_ORIGINS', '*').split(',')
        if item.strip()
    ]
    
    # JSON配置 - 禁用ASCII转义，让中文直接显示（而不是 \uXXXX 格式）
    JSON_AS_ASCII = False
    
    # LLM配置（统一使用OpenAI格式）
    LLM_API_KEY = os.environ.get('LLM_API_KEY')
    LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'https://api.openai.com/v1')
    LLM_MODEL_NAME = os.environ.get('LLM_MODEL_NAME', 'gpt-4o-mini')
    
    # Zep配置
    ZEP_API_KEY = os.environ.get('ZEP_API_KEY')
    
    _RUNTIME_DATA_ROOT = os.environ.get(
        'MIROFISH_DATA_DIR',
        '/tmp/mirofish-data' if os.environ.get('VERCEL') else os.path.join(os.path.dirname(__file__), '..')
    )

    # 文件上传配置
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB
    UPLOAD_FOLDER = os.environ.get('MIROFISH_UPLOAD_DIR', os.path.join(_RUNTIME_DATA_ROOT, 'uploads'))
    ALLOWED_EXTENSIONS = {'pdf', 'md', 'txt', 'markdown'}
    
    # 文本处理配置
    DEFAULT_CHUNK_SIZE = 500  # 默认切块大小
    DEFAULT_CHUNK_OVERLAP = 50  # 默认重叠大小
    
    # OASIS模拟配置
    OASIS_DEFAULT_MAX_ROUNDS = int(os.environ.get('OASIS_DEFAULT_MAX_ROUNDS', '10'))
    OASIS_SIMULATION_DATA_DIR = os.path.join(UPLOAD_FOLDER, 'simulations')
    
    # OASIS平台可用动作配置
    OASIS_TWITTER_ACTIONS = [
        'CREATE_POST', 'LIKE_POST', 'REPOST', 'FOLLOW', 'DO_NOTHING', 'QUOTE_POST'
    ]
    OASIS_REDDIT_ACTIONS = [
        'LIKE_POST', 'DISLIKE_POST', 'CREATE_POST', 'CREATE_COMMENT',
        'LIKE_COMMENT', 'DISLIKE_COMMENT', 'SEARCH_POSTS', 'SEARCH_USER',
        'TREND', 'REFRESH', 'DO_NOTHING', 'FOLLOW', 'MUTE'
    ]
    
    # Report Agent配置
    REPORT_AGENT_MAX_TOOL_CALLS = int(os.environ.get('REPORT_AGENT_MAX_TOOL_CALLS', '5'))
    REPORT_AGENT_MAX_REFLECTION_ROUNDS = int(os.environ.get('REPORT_AGENT_MAX_REFLECTION_ROUNDS', '2'))
    REPORT_AGENT_TEMPERATURE = float(os.environ.get('REPORT_AGENT_TEMPERATURE', '0.5'))
    
    @classmethod
    def is_production(cls):
        if cls.ENVIRONMENT.strip().lower() in {'prod', 'production'}:
            return True
        return any(os.environ.get(name) for name in ('RENDER', 'RAILWAY_ENVIRONMENT', 'FLY_APP_NAME'))

    @classmethod
    def runtime_status(cls):
        production = cls.is_production()
        wildcard_cors = any(item.strip().lower() in {'*', 'all'} for item in cls.CORS_ORIGINS)
        errors = []
        if not cls.LLM_API_KEY:
            errors.append("LLM_API_KEY 未配置")
        if not cls.ZEP_API_KEY:
            errors.append("ZEP_API_KEY 未配置")
        if production and cls.SECRET_KEY in {'', 'mirofish-secret-key', 'change-me-in-production'}:
            errors.append("SECRET_KEY must be set to a non-development value in production")
        if production and wildcard_cors:
            errors.append("MIROFISH_CORS_ORIGINS must list explicit public StorySage origins in production")
        return {
            'production': production,
            'configured': len(errors) == 0,
            'errors': errors,
            'cors': {
                'origins_configured': bool(cls.CORS_ORIGINS),
                'wildcard': wildcard_cors,
                'origin_count': len(cls.CORS_ORIGINS),
            },
            'providers': {
                'llm_configured': bool(cls.LLM_API_KEY),
                'zep_configured': bool(cls.ZEP_API_KEY),
                'model': cls.LLM_MODEL_NAME,
            },
        }

    @classmethod
    def validate(cls):
        """验证必要配置"""
        return cls.runtime_status()['errors']

