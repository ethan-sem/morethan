import React from "react";
import { CircleAlert, RefreshCcw } from "lucide-react";
import { getBrowserFlowSessionStore } from "../lib/sessionStore.js";

export class CopilotErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  retry = () => {
    this.setState({ hasError: false });
  };

  restart = () => {
    getBrowserFlowSessionStore().clear();
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="copilot-fallback" role="alert">
        <CircleAlert size={34} />
        <h2>当前页面没有正确加载</h2>
        <p>你可以重试当前页面；如果问题持续，重新开始会清除本次流程位置。</p>
        <div>
          <button type="button" onClick={this.retry}><RefreshCcw size={17} />重试</button>
          <button type="button" onClick={this.restart}>重新开始</button>
        </div>
      </section>
    );
  }
}

