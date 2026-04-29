/**
 * 启动诊断 - 在 React 挂载前捕获所有致命错误
 * 让用户即使白屏也能看到具体原因
 */

interface Diagnosis {
  stage: string;
  errors: string[];
  checks: Record<string, string>;
}

const diagnosis: Diagnosis = {
  stage: 'init',
  errors: [],
  checks: {},
};

function log(stage: string, msg: string) {
  diagnosis.stage = stage;
  console.log(`[BootDiag] ${stage}: ${msg}`);
}

function fail(stage: string, msg: string) {
  diagnosis.stage = stage;
  diagnosis.errors.push(`[${stage}] ${msg}`);
  console.error(`[BootDiag] ${stage}: ${msg}`);
}

function check(name: string, ok: boolean, detail: string) {
  diagnosis.checks[name] = ok ? `OK: ${detail}` : `FAIL: ${detail}`;
}

// 捕获所有未处理的错误
window.addEventListener('error', (e) => {
  fail('window.onerror', `${e.message} at ${e.filename}:${e.lineno}`);
  showDiagnosis();
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
  fail('unhandledrejection', reason);
  showDiagnosis();
});

// 基础环境检查
log('env', '检查浏览器环境...');
check('js', true, 'JavaScript running');
check('esm', typeof window !== 'undefined' && 'import' in window, 'ES Modules');
check('indexedDB', 'indexedDB' in window, 'IndexedDB API');
check('localStorage', 'localStorage' in window, 'localStorage');

// 检查 document
if (!document.getElementById('root')) {
  fail('dom', '找不到 #root 元素');
}

// 显示诊断界面
export function showDiagnosis() {
  if (document.getElementById('boot-diag')) return;

  const div = document.createElement('div');
  div.id = 'boot-diag';
  div.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:#0f0f0f;color:#e5e5e5;
    font-family:system-ui,-apple-system,sans-serif;
    padding:24px;overflow:auto;
  `;

  const checksHtml = Object.entries(diagnosis.checks)
    .map(([k, v]) => {
      const ok = v.startsWith('OK');
      return `<div style="margin:4px 0;font-size:13px;">
        <span style="color:${ok ? '#4ade80' : '#f87171'};">${ok ? '✓' : '✗'}</span>
        <strong>${k}</strong>: ${v.replace(/^OK: |^FAIL: /, '')}
      </div>`;
    })
    .join('');

  const errorsHtml = diagnosis.errors.length
    ? diagnosis.errors
        .map((e) => `<pre style="background:#1a1a1a;padding:10px;border-radius:6px;font-size:12px;color:#f87171;overflow:auto;margin:6px 0;">${e}</pre>`)
        .join('')
    : '<p style="color:#4ade80;font-size:13px;">暂无捕获到的错误</p>';

  div.innerHTML = `
    <div style="max-width:640px;margin:0 auto;">
      <h2 style="font-size:18px;margin:0 0 12px;color:#f87171;">⚠️ 智学图谱启动失败</h2>
      <p style="font-size:13px;color:#a3a3a3;margin:0 0 16px;">
        当前阶段: <strong style="color:#e5e5e5;">${diagnosis.stage}</strong><br/>
        如果下方有红色错误，请截图发给开发者。
      </p>

      <div style="background:#1a1a1a;border-radius:8px;padding:12px;margin-bottom:16px;">
        <h3 style="font-size:14px;margin:0 0 8px;color:#d4d4d4;">环境检查</h3>
        ${checksHtml}
      </div>

      <div style="background:#1a1a1a;border-radius:8px;padding:12px;margin-bottom:16px;">
        <h3 style="font-size:14px;margin:0 0 8px;color:#d4d4d4;">捕获的错误</h3>
        ${errorsHtml}
      </div>

      <div style="background:#1a1a1a;border-radius:8px;padding:12px;margin-bottom:16px;">
        <h3 style="font-size:14px;margin:0 0 8px;color:#d4d4d4;">一键修复</h3>
        <p style="font-size:12px;color:#a3a3a3;margin:0 0 8px;">
          如果怀疑是本地数据库损坏，点击下面按钮清除所有本地数据（会丢失工作空间、文件列表等，但不会影响服务器数据）：
        </p>
        <button id="boot-diag-clear" style="padding:8px 16px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
          清除本地数据库并刷新
        </button>
        <button id="boot-diag-reload" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;margin-left:8px;">
          仅强制刷新页面
        </button>
      </div>

      <div style="font-size:11px;color:#525252;margin-top:12px;">
        构建时间: ${new Date().toLocaleString('zh-CN')} | 用户代理: ${navigator.userAgent.slice(0, 120)}...
      </div>
    </div>
  `;

  document.body.appendChild(div);

  document.getElementById('boot-diag-clear')?.addEventListener('click', () => {
    try {
      indexedDB.deleteDatabase('ScholarGraphDB');
      localStorage.clear();
      alert('已清除本地数据，页面即将刷新');
      location.reload();
    } catch (e) {
      alert('清除失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  });

  document.getElementById('boot-diag-reload')?.addEventListener('click', () => {
    location.reload();
  });
}

export { diagnosis, log, fail };
