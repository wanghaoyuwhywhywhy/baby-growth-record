import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-container flex items-center justify-center min-h-[100dvh]">
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <p className="text-lg font-medium">页面加载出错</p>
            <p className="text-sm text-muted max-w-xs">
              可能是缓存过期，请尝试以下操作：
            </p>
            <button
              onClick={() => {
                // 清除所有缓存后刷新
                if ('caches' in window) {
                  caches.keys().then(names => names.forEach(name => caches.delete(name)));
                }
                localStorage.setItem('last_refresh_time', String(Date.now()));
                window.location.reload();
              }}
              className="px-6 py-2 bg-coral text-white rounded-full text-sm font-medium"
            >
              清除缓存并刷新
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 border border-coral/30 rounded-full text-sm text-coral"
            >
              仅刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
