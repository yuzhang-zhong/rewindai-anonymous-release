"""
MiroFish Backend - Flask应用工厂
"""

import os
import re
import warnings

# 抑制 multiprocessing resource_tracker 的警告（来自第三方库如 transformers）
# 需要在所有其他导入之前设置
warnings.filterwarnings("ignore", message=".*resource_tracker.*")

from flask import Flask, request
from flask_cors import CORS

from .config import Config
from .utils.logger import setup_logger, get_logger


_LOG_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{12,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),
    re.compile(
        r"(?i)\b(api[_-]?key|token|secret|password|authorization|bearer)\b"
        r"\s*[:=]\s*['\"]?[^'\"\s,;]+"
    ),
]
_WINDOWS_PATH_PATTERN = re.compile(r"[A-Za-z]:\\[^\s\"']+")
_UNIX_PATH_PATTERN = re.compile(r"(?<!\w)/(?:[^/\s\"']+/){2,}[^/\s\"']+")


def _sanitize_log_value(value):
    """Redact credential-like values before request data reaches log files."""
    if isinstance(value, dict):
        return {
            key: "[REDACTED_SECRET]" if re.search(
                r"(?i)(api[_-]?key|token|secret|password|authorization|bearer)",
                str(key)
            ) else _sanitize_log_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_log_value(item) for item in value]
    if isinstance(value, str):
        text = value
        for pattern in _LOG_SECRET_PATTERNS:
            text = pattern.sub("[REDACTED_SECRET]", text)
        return text
    return value


def _sanitize_public_json_value(value):
    """Remove internal diagnostics and credential-like values from JSON responses."""
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if str(key).lower() == "traceback":
                continue
            sanitized[key] = _sanitize_public_json_value(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_public_json_value(item) for item in value]
    if isinstance(value, str):
        text = value
        for pattern in _LOG_SECRET_PATTERNS:
            text = pattern.sub("[REDACTED_SECRET]", text)
        text = _WINDOWS_PATH_PATTERN.sub("[REDACTED_PATH]", text)
        text = _UNIX_PATH_PATTERN.sub("[REDACTED_PATH]", text)
        text = re.sub(
            r"(?i)traceback \(most recent call last\):.*",
            "traceback redacted",
            text,
            flags=re.S,
        )
        return text
    return value


def create_app(config_class=Config):
    """Flask应用工厂函数"""
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # 设置JSON编码：确保中文直接显示（而不是 \uXXXX 格式）
    # Flask >= 2.3 使用 app.json.ensure_ascii，旧版本使用 JSON_AS_ASCII 配置
    if hasattr(app, 'json') and hasattr(app.json, 'ensure_ascii'):
        app.json.ensure_ascii = False
    
    # 设置日志
    logger = setup_logger('mirofish')
    
    # 只在 reloader 子进程中打印启动信息（避免 debug 模式下打印两次）
    is_reloader_process = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    debug_mode = app.config.get('DEBUG', False)
    should_log_startup = not debug_mode or is_reloader_process
    
    if should_log_startup:
        logger.info("=" * 50)
        logger.info("MiroFish Backend 启动中...")
        logger.info("=" * 50)
    
    # 启用CORS；开发环境默认宽松，生产环境由 Config.validate 强制显式 origin。
    CORS(app, resources={r"/api/*": {"origins": config_class.CORS_ORIGINS}})
    
    # 注册模拟进程清理函数（确保服务器关闭时终止所有模拟进程）
    from .services.simulation_runner import SimulationRunner
    SimulationRunner.register_cleanup()
    if should_log_startup:
        logger.info("已注册模拟进程清理函数")
    
    # 请求日志中间件
    @app.before_request
    def log_request():
        logger = get_logger('mirofish.request')
        logger.debug(f"请求: {request.method} {request.path}")
        if request.content_type and 'json' in request.content_type:
            logger.debug(f"请求体: {_sanitize_log_value(request.get_json(silent=True))}")
    
    @app.after_request
    def log_response(response):
        if request.path.startswith("/api/") and response.is_json:
            payload = response.get_json(silent=True)
            if payload is not None:
                response.set_data(app.json.dumps(_sanitize_public_json_value(payload)))
        logger = get_logger('mirofish.request')
        logger.debug(f"响应: {response.status_code}")
        return response
    
    # 注册蓝图
    from .api import graph_bp, simulation_bp, report_bp
    app.register_blueprint(graph_bp, url_prefix='/api/graph')
    app.register_blueprint(simulation_bp, url_prefix='/api/simulation')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    
    # 健康检查
    @app.route('/health')
    def health():
        return {
            'status': 'ok',
            'service': 'MiroFish Backend',
            'runtime': config_class.runtime_status(),
        }
    
    if should_log_startup:
        logger.info("MiroFish Backend 启动完成")
    
    return app

