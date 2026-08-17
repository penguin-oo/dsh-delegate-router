// dsh-delegate-router — client half: routing-ledger panel (sidebar entry +
// overlay reading the ledger through the stats Remote).
import { useCallback, useEffect, useState } from "react";
import { TYPERT_REMOTE } from "../../lib/typert.remote-client.js";

const NS = "delegateRouter";
const inject = ["slots", "remote", "sessions", "locale"];

const TRIGGER_LABEL = {
  "auto-light": "轻任务→Flash",
  "auto-heavy": "重任务→Pro",
  "auto-short": "短任务→Flash",
  peak: "峰时降级→Flash",
  "flash-all": "全量Flash",
  budget: "预算降级",
  manual: "手动指定",
};

const zh = {};
const en = {};

/** Overlay listing one session's routing decisions. */
function LedgerPanel({ decisions, onClose }) {
  return (
    <div className="dshdr_veil" onClick={onClose}>
      <div className="dshdr_panel" onClick={(event) => event.stopPropagation()}>
        <div className="dshdr_head">
          <b>子代理模型分派记录</b>
          <button className="dshdr_close" onClick={onClose}>
            ✕
          </button>
        </div>
        {decisions.length === 0 ? (
          <div className="dshdr_empty">本会话还没有分派记录。让 agent 派几个子代理试试。</div>
        ) : (
          decisions.map((decision, index) => (
            <div className="dshdr_row" key={index}>
              <div className="dshdr_rowTop">
                <span className="dshdr_trigger">{TRIGGER_LABEL[decision.trigger] ?? decision.trigger}</span>
                <span className="dshdr_route">{decision.route}</span>
              </div>
              <div className="dshdr_task">{decision.task.slice(0, 120)}</div>
              <div className="dshdr_time">{new Date(decision.at).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
      <style>{`
        .dshdr_veil{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
        .dshdr_panel{width:min(560px,92vw);max-height:72vh;overflow:auto;border-radius:12px;background:var(--dsw-alias-bg-overlay,#171b21);color:var(--dsw-alias-label-primary,#e8eaed);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));padding:16px 18px}
        .dshdr_head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .dshdr_close{background:transparent;border:none;color:inherit;cursor:pointer;font-size:16px}
        .dshdr_empty{opacity:.7;font-size:13px}
        .dshdr_row{border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));padding:8px 0;font-size:13px}
        .dshdr_row:first-of-type{border-top:none}
        .dshdr_rowTop{display:flex;justify-content:space-between;gap:8px}
        .dshdr_trigger{font-weight:600}
        .dshdr_route{font-family:monospace;color:var(--dsw-alias-brand-primary,#7aa2ff)}
        .dshdr_task{opacity:.75;margin-top:2px}
        .dshdr_time{opacity:.5;font-size:11px;margin-top:2px}
      `}</style>
    </div>
  );
}

/** Fetches the ledger for the current session and renders the panel. */
function LedgerHost({ ctx, onClose }) {
  const [decisions, setDecisions] = useState([]);
  const refresh = useCallback(async () => {
    try {
      const remote = ctx.get("remote.delegateRouterStats");
      const sessionId = ctx.sessions.list.getSnapshot().current ?? null;
      const carried = await remote.list({ sessionId });
      const result = carried?.ok ? carried.value : null;
      setDecisions(result?.ok ? (result.value?.decisions ?? []) : []);
    } catch {
      setDecisions([]);
    }
  }, [ctx]);
  useEffect(() => {
    void refresh();
    // Re-fetch when the active session changes while the panel is open.
    return ctx.sessions.list.subscribe(() => void refresh());
  }, [refresh, ctx]);
  return <LedgerPanel decisions={decisions} onClose={onClose} />;
}

async function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "delegate-router: dictionaries");
  await ctx.remote.$mount(TYPERT_REMOTE);

  let open = false;
  const listeners = new Set();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  ctx.slots.inject("shell.overlay", () => {
    const dispose = ctx.slots.register(
      { name: "shell.overlay", id: "delegate-router-ledger", order: 20, locale: NS, inject: () => ({}) },
      () => {
        const [, force] = useState(0);
        useEffect(() => {
          const listener = () => force((value) => value + 1);
          listeners.add(listener);
          return () => listeners.delete(listener);
        }, []);
        return open ? <LedgerHost ctx={ctx} onClose={() => { open = false; notify(); }} /> : null;
      },
    );
    return () => dispose();
  });

  ctx.slots.inject("sidebar.footer.action", () => {
    const dispose = ctx.slots.register(
      { name: "sidebar.footer.action", id: "delegate-router", order: 30, locale: NS, inject: () => ({}) },
      () => (
        <button className="dshdr_toggle" onClick={() => { open = true; notify(); }} title="子代理分派记录">
          ⚡ 分派记录
        </button>
      ),
    );
    return () => dispose();
  });
}

export { apply, inject };
