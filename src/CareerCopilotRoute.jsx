import React, { Suspense, lazy } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";

const loadCareerCopilot = () => import("./careerCopilot.jsx");
const CareerCopilotPage = lazy(() => loadCareerCopilot().then((module) => ({ default: module.CareerCopilotPage })));

export function CareerCopilotRoute({ navigate, registerLeaveGuard }) {
  return (
    <CareerRouteErrorBoundary onRetry={() => window.location.reload()} onExit={() => navigate("home")}>
      <Suspense fallback={<CareerRouteLoading />}>
        <CareerCopilotPage navigate={navigate} registerLeaveGuard={registerLeaveGuard} />
      </Suspense>
    </CareerRouteErrorBoundary>
  );
}

function CareerRouteLoading() {
  return (
    <section className="career-route-state" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <p>正在打开智能求职助手</p>
      <small>仅加载开始诊断所需内容</small>
    </section>
  );
}

class CareerRouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="career-route-state is-error" role="alert">
        <p>智能求职助手暂时没有加载成功</p>
        <small>本次没有上传或保存任何简历内容。</small>
        <div>
          <button type="button" onClick={this.props.onRetry}><RefreshCcw size={16} />重新加载</button>
          <button type="button" onClick={this.props.onExit}><ArrowLeft size={16} />返回官网</button>
        </div>
      </section>
    );
  }
}
