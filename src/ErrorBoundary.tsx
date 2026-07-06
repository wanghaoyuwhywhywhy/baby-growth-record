import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  clearing: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, clearing: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, clearing: false };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleClearCache = async () => {
    this.setState({ clearing: true });
    try {
      // 清除 Cache API 缓存
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
      // 清除 Service Worker
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.unregister()));
      }
      // 强制刷新
      window.location.href = window.location.origin + window.location.pathname;
    } catch (e) {
      // 最后手段：直接跳转
      window.location.href = '/';
    }
  };

  handleNuclearReset = () => {
    // 清除所有本地数据
    localStorage.clear();
    sessionStorage.clear();
    indexedDB.deleteDatabase('baby-growth-record');
    this.handleClearCache();
  };

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || '未知错误';
      const errStack = this.state.error?.stack || '';

      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFF8F5' }}>
          <div style={{ maxWidth: '360px' }}>
            <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#333' }}>页面加载出错</p>
            <p style={{ fontSize: '12px', color: '#999', marginBottom: '16px', wordBreak: 'break-all' }}>
              {errMsg}
            </p>
            <details style={{ textAlign: 'left', marginBottom: '20px', fontSize: '11px', color: '#999', maxHeight: '120px', overflow: 'auto' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '4px' }}>错误详情</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{errStack}</pre>
            </details>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={this.handleClearCache}
                disabled={this.state.clearing}
                style={{ padding: '10px 24px', background: '#FF7B7B', color: 'white', border: 'none', borderRadius: '20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', opacity: this.state.clearing ? 0.6 : 1 }}
              >
                {this.state.clearing ? '清除中...' : '清除缓存并刷新'}
              </button>
              <button
                onClick={this.handleNuclearReset}
                style={{ padding: '10px 24px', background: 'transparent', color: '#FF7B7B', border: '1px solid #FF7B7B33', borderRadius: '20px', fontSize: '14px', cursor: 'pointer' }}
              >
                重置所有数据
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
