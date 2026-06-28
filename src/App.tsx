import { useEffect, useState } from 'react';
import Phaser from 'phaser';
import { gameConfig } from './game/config';
import { gameBridge } from './game/gameBridge';
import { LEVELS } from './game/constants';
import type { ArcSpacing, LevelKey, LoadCaseKey, MaterialKey, UIState } from './game/types';
import { IntroSheet } from './IntroSheet';
import { QUOTES } from './game/quotes';
import './styles.css';

const materialMeta: Array<{ key: MaterialKey; icon: string; name: string; detail: string; hotkey: string }> = [
  { key: 'road', icon: '═', name: '桥面', detail: '车辆必须沿它通行', hotkey: '1' },
  { key: 'wood', icon: '╱', name: '木材', detail: '便宜，适合三角斜撑', hotkey: '2' },
  { key: 'steel', icon: '◆', name: '钢材', detail: '坚固，但会迅速吃掉预算', hotkey: '3' },
  { key: 'cable', icon: '⌒', name: '高强缆索', detail: '强度提高，只受拉不受压', hotkey: '4' },
];

const loadMeta: Array<{ key: LoadCaseKey; icon: string; name: string; detail: string }> = [
  { key: 'sedan', icon: '▰', name: '小汽车', detail: '轻载入门' },
  { key: 'truck', icon: '▣', name: '重型卡车', detail: '高强度挑战' },
  { key: 'crowd', icon: '♟', name: '通勤人群', detail: '多点移动荷载' },
];

const levelOrder: LevelKey[] = ['beam', 'truss', 'arch', 'cableStayed', 'suspension'];
const arcSpacings: ArcSpacing[] = [40, 55, 80, 110];

const levelExplanation: Record<LevelKey, string> = {
  beam: '梁高增加时，惯性矩 I 按高度的三次方增长，抗弯截面模量 W 按二次方增长。箱梁把材料移向上下缘，用更小自重获得更高效率。',
  truss: '四边形容易歪斜，三角形边长确定后形状稳定。连续三角形把桥面荷载转化为杆件的拉力与压力。',
  arch: '拱肋以轴向压力为主，把荷载推向两岸；连续截面还要抵抗移动荷载造成的局部弯矩。',
  cableStayed: '斜拉索直接托住桥面，桥塔承受压力和弯矩；主跨索与边跨背索共同控制塔顶偏移。',
  suspension: '吊杆沿全跨把桥面荷载送入主缆；双塔直接落在两岸基础上，形成没有边跨的单跨悬索体系。',
};

export default function App() {
  const [state, setState] = useState<UIState>(gameBridge.snapshot());
  const [introOpen, setIntroOpen] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [quoteIdx, setQuoteIdx] = useState(0);

  // Cycle to the next bridge quotation each time a load test finishes.
  useEffect(() => {
    if (state.mode === 'success' || state.mode === 'failure') {
      setQuoteIdx((index) => (index + 1) % QUOTES.length);
    }
  }, [state.mode]);
  const quote = QUOTES[quoteIdx];

  useEffect(() => {
    const game = new Phaser.Game(gameConfig);
    const onState = (event: Event) => setState((event as CustomEvent<UIState>).detail);
    gameBridge.addEventListener('state', onState);
    return () => {
      gameBridge.removeEventListener('state', onState);
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (introOpen) return;
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        gameBridge.command({ type: 'undo' });
        return;
      }
      const index = Number(event.key) - 1;
      if (index >= 0 && index < materialMeta.length && state.mode === 'build') {
        gameBridge.command({ type: 'material', material: materialMeta[index].key });
      }
      if (event.code === 'Space') {
        event.preventDefault();
        gameBridge.command({ type: state.mode === 'build' ? 'test' : 'stop' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [introOpen, state.mode]);

  const beginWithBlueprint = () => {
    gameBridge.command({ type: 'blueprint' });
    setIntroOpen(false);
  };

  const beginEmpty = () => {
    gameBridge.command({ type: 'clear' });
    setIntroOpen(false);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    gameBridge.command({ type: 'sound', enabled: next });
  };

  const isResult = state.mode === 'success' || state.mode === 'failure';
  const budgetRatio = Math.min(100, (state.budget / state.budgetMax) * 100);
  const stressRatio = Math.min(100, state.maxStress);
  const beamStressRatio = Math.min(100, state.beamStress);
  const selectedLoad = loadMeta.find((item) => item.key === state.loadCase) ?? loadMeta[0];
  const selectedLevel = LEVELS[state.level];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block" aria-label="桥造计划">
          <span className="brand-mark" aria-hidden="true">△</span>
          <div>
            <p className="eyebrow">SPANCRAFT FIELD TEST 01</p>
            <h1>桥造计划</h1>
          </div>
        </div>

        <div className="mission-title">
          <span>当前任务</span>
          <strong>{selectedLevel.name}</strong>
        </div>

        <div className="header-actions">
          <button className="icon-button" onClick={toggleSound} aria-label={soundEnabled ? '关闭声音' : '开启声音'}>
            {soundEnabled ? '声' : '静'}
          </button>
          <button className="help-button" onClick={() => setIntroOpen(true)}>怎么玩</button>
        </div>
      </header>

      <main className="workbench">
        <aside className="tool-rail" id="game-controls" aria-label="建造材料">
          <div className="rail-heading">
            <span>材料箱</span>
            <small>拖动施工</small>
          </div>
          <div className="material-list">
            {materialMeta.map((item) => (
              <button
                key={item.key}
                className={`material-button ${state.material === item.key ? 'is-active' : ''}`}
                onClick={() => gameBridge.command({ type: 'material', material: item.key })}
                disabled={state.mode !== 'build'}
                aria-pressed={state.material === item.key}
              >
                <span className={`material-swatch material-${item.key}`} aria-hidden="true">{item.icon}</span>
                <span className="material-copy">
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
                <kbd>{item.hotkey}</kbd>
              </button>
            ))}
          </div>

          <section className="curve-tool" aria-label="构件成形工具">
            <div className="curve-tool-heading"><span>成形工具</span><small>拖动两端点</small></div>
            <div className="tool-mode-options">
              <button
                className={state.buildTool === 'line' ? 'is-active' : ''}
                onClick={() => gameBridge.command({ type: 'build-tool', tool: 'line' })}
                disabled={state.mode !== 'build'}
                aria-pressed={state.buildTool === 'line'}
              >／ 直线</button>
              <button
                className={state.buildTool === 'arc' ? 'is-active' : ''}
                onClick={() => gameBridge.command({ type: 'build-tool', tool: 'arc' })}
                disabled={state.mode !== 'build'}
                aria-pressed={state.buildTool === 'arc'}
              >⌒ 弧线</button>
            </div>
            {state.buildTool === 'arc' && (
              <div className="arc-spacing-options" aria-label="弧线桥向分段距离">
                <span>分段</span>
                {arcSpacings.map((spacing) => (
                  <button
                    key={spacing}
                    className={state.arcSpacing === spacing ? 'is-active' : ''}
                    onClick={() => gameBridge.command({ type: 'arc-spacing', spacing })}
                    disabled={state.mode !== 'build'}
                    aria-pressed={state.arcSpacing === spacing}
                  >{spacing}</button>
                ))}
              </div>
            )}
          </section>

          <div className="rail-tools">
            <button onClick={() => gameBridge.command({ type: 'undo' })} disabled={!state.canUndo}>↶ 撤销</button>
            <button onClick={() => gameBridge.command({ type: 'clear' })} disabled={state.mode !== 'build'}>清空</button>
          </div>
          <p className="rail-tip">右键构件可快速拆除</p>
        </aside>

        <section className="game-stage" aria-label="桥梁建造场景">
          <div className="canvas-frame">
            <div id="game-root" />
            <div className={`mode-flag mode-${state.mode}`} aria-live="polite">
              <span className="mode-dot" />
              {modeLabel(state.mode)}
            </div>
            <div className="stress-legend" aria-label="应力颜色图例">
              <span>受力</span>
              <i className="safe" />安全
              <i className="warn" />吃力
              <i className="danger" />将断
            </div>
            {isResult && (
              <div className={`result-card result-${state.mode}`} role="dialog" aria-modal="true" aria-labelledby="result-title">
                <span className="result-stamp">{state.mode === 'success' ? 'PASSED' : 'REBUILD'}</span>
                <h2 id="result-title">{state.mode === 'success' ? `${selectedLoad.name}安全抵达！` : '桥面断开了'}</h2>
                <p>{state.hint}</p>
                <div className="result-stats">
                  <span><b>{state.budget}</b> / {state.budgetMax} 预算</span>
                  <span><b>{state.maxStress}%</b> 峰值受力</span>
                  <span><b>{state.beamStress}%</b> 主梁抗弯</span>
                </div>
                <figure className="result-quote">
                  <blockquote>{quote.text}{quote.en && <cite className="quote-en">{quote.en}</cite>}</blockquote>
                  {quote.author && (
                    <figcaption>—— {quote.author}{quote.brief && <small>{quote.brief}</small>}</figcaption>
                  )}
                </figure>
                <button className="primary-button" onClick={() => gameBridge.command({ type: 'stop' })}>
                  {state.mode === 'success' ? '回到工地继续优化' : '回到断点补强'}
                </button>
              </div>
            )}
          </div>

          <div className="status-strip" aria-live="polite">
            <span className="foreman">工长提示</span>
            <p>{state.hint}</p>
          </div>
        </section>

        <aside className="coach-panel" aria-label="任务说明">
          <div className="coach-header">
            <p className="eyebrow">SITE NOTE / {selectedLevel.number}</p>
            <h2>{selectedLevel.shortName}实验场</h2>
            <p>{selectedLevel.mission}</p>
          </div>

          {state.mode === 'build' && (
          <>
          <section className="level-picker" aria-labelledby="level-picker-title">
            <div className="load-picker-heading">
              <span id="level-picker-title">选择关卡</span>
              <small>{selectedLevel.number} / 05</small>
            </div>
            <div className="level-options">
              {levelOrder.map((levelKey) => {
                const level = LEVELS[levelKey];
                return (
                  <button
                    key={levelKey}
                    className={`level-option ${state.level === levelKey ? 'is-active' : ''}`}
                    onClick={() => gameBridge.command({ type: 'level', level: levelKey })}
                    disabled={state.mode !== 'build'}
                    aria-pressed={state.level === levelKey}
                  >
                    <span>{level.number}</span>
                    <b>{level.shortName}</b>
                    <small>{level.concept}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="section-designer" aria-labelledby="section-designer-title">
            <div className="section-designer-heading">
              <div>
                <span id="section-designer-title">主梁截面</span>
                <small>越轻越省，抗弯越高效</small>
              </div>
            </div>

            <div className="section-shape-options" aria-label="截面形式">
              <button
                className={state.beamSection.shape === 'solid' ? 'is-active' : ''}
                onClick={() => gameBridge.command({ type: 'beam-section', patch: { shape: 'solid' } })}
                disabled={state.mode !== 'build'}
                aria-pressed={state.beamSection.shape === 'solid'}
              >
                <svg className="section-glyph" viewBox="0 0 34 20" aria-hidden="true">
                  <rect x="1.5" y="6" width="31" height="11" rx="2.5" fill="#728f98" stroke="#18324a" strokeWidth="2" />
                  <circle cx="9" cy="11.5" r="2.5" fill="#e8e0cb" />
                  <circle cx="17" cy="11.5" r="2.5" fill="#e8e0cb" />
                  <circle cx="25" cy="11.5" r="2.5" fill="#e8e0cb" />
                </svg>
                <span><b>空心板梁</b><small>小跨经济</small></span>
              </button>
              <button
                className={state.beamSection.shape === 'box' ? 'is-active' : ''}
                onClick={() => gameBridge.command({ type: 'beam-section', patch: { shape: 'box' } })}
                disabled={state.mode !== 'build'}
                aria-pressed={state.beamSection.shape === 'box'}
              >
                <svg className="section-glyph" viewBox="0 0 34 20" aria-hidden="true">
                  <polygon points="7,8 27,8 30,17 4,17" fill="#728f98" stroke="#18324a" strokeWidth="2" strokeLinejoin="round" />
                  <polygon points="11,10.5 23,10.5 24.5,15 9.5,15" fill="#e8e0cb" />
                  <rect x="1.5" y="5" width="31" height="3.6" rx="1" fill="#728f98" stroke="#18324a" strokeWidth="1.5" />
                </svg>
                <span><b>箱梁</b><small>大跨更轻</small></span>
              </button>
            </div>

            <div className="design-assists" aria-label="结构辅助选项">
              <button
                className={state.midspanSupport ? 'is-active' : ''}
                onClick={() => gameBridge.command({ type: 'midspan-support', enabled: !state.midspanSupport })}
                disabled={state.mode !== 'build' || state.level !== 'beam'}
                aria-pressed={state.midspanSupport}
              >
                <span>┴</span><b>跨中支座</b><small>{state.level === 'beam' ? '改为两跨连续梁' : '仅梁桥关可用'}</small>
              </button>
              <button
                className={`indestructible-option ${state.indestructible ? 'is-active' : ''}`}
                onClick={() => gameBridge.command({ type: 'indestructible', enabled: !state.indestructible })}
                disabled={state.mode !== 'build'}
                aria-pressed={state.indestructible}
              >
                <span>∞</span><b>牢不可破</b><small>保留应力，不触发断裂</small>
              </button>
            </div>
          </section>

          <section className="load-picker" aria-labelledby="load-picker-title">
            <div className="load-picker-heading">
              <span id="load-picker-title">试验荷载</span>
              <small>施工模式可切换</small>
            </div>
            <div className="load-options">
              {loadMeta.map((item) => (
                <button
                  key={item.key}
                  className={`load-option ${state.loadCase === item.key ? 'is-active' : ''}`}
                  onClick={() => gameBridge.command({ type: 'load-case', loadCase: item.key })}
                  disabled={state.mode !== 'build'}
                  aria-pressed={state.loadCase === item.key}
                  title={item.detail}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <b>{item.name}</b>
                  <small>{item.detail}</small>
                </button>
              ))}
            </div>
          </section>

          <ol className="mission-steps">
            <li className={state.hasBridge ? 'is-done' : 'is-current'}>
              <span>1</span>
              <div><strong>连接桥面</strong><small>桥面必须从西岸连续到东岸</small></div>
            </li>
            <li className={state.hasBridge ? 'is-current' : ''}>
              <span>2</span>
              <div><strong>{selectedLevel.concept}</strong><small>{selectedLevel.hint}</small></div>
            </li>
            <li className={state.hasBridge ? 'is-current' : ''}>
              <span>3</span>
              <div><strong>开始加载</strong><small>点击下方 ▶ 通车，绿色安全、红色将断</small></div>
            </li>
          </ol>
          </>
          )}

          <div className="meter-card">
            <div className="meter-label"><span>建造预算</span><b>{state.budget} / {state.budgetMax}</b></div>
            <div className="meter-track"><i className={budgetRatio > 90 ? 'meter-hot' : ''} style={{ transform: `scaleX(${budgetRatio / 100})` }} /></div>
          </div>

          {state.mode !== 'build' && (
          <>
          <div className="meter-card girder-meter">
            <div className="meter-label"><span>主梁抗弯利用率</span><b>{state.beamStress}%</b></div>
            <div className="meter-track stress"><i style={{ transform: `scaleX(${beamStressRatio / 100})` }} /></div>
          </div>

          <div className="meter-card">
            <div className="meter-label"><span>峰值受力</span><b>{state.maxStress}%</b></div>
            <div className="meter-track stress"><i style={{ transform: `scaleX(${stressRatio / 100})` }} /></div>
          </div>
          </>
          )}

          <details className="field-note">
            <summary>为什么这样传力？</summary>
            <p>{levelExplanation[state.level]}</p>
          </details>
        </aside>
      </main>

      <footer className="action-dock">
        <div className="build-summary">
          <span><b>{state.memberCount}</b> 根构件</span>
          <span><b>{state.vehicleProgress}%</b> 荷载进度</span>
        </div>
        <button
          className="blueprint-button"
          onClick={() => gameBridge.command({ type: 'blueprint' })}
          disabled={state.mode !== 'build'}
        >
          <span aria-hidden="true">⌁</span> 重置本关
        </button>
        <button
          className="test-button"
          onClick={() => gameBridge.command({ type: state.mode === 'build' ? 'test' : 'stop' })}
          disabled={!state.ready}
        >
          <span aria-hidden="true">{state.mode === 'build' ? '▶' : '■'}</span>
          {state.mode === 'build' ? `加载：${selectedLoad.name}` : '停止加载'}
          <kbd>Space</kbd>
        </button>
      </footer>

      {introOpen && (
        <IntroSheet
          onStartBlueprint={beginWithBlueprint}
          onStartEmpty={beginEmpty}
          onClose={() => setIntroOpen(false)}
        />
      )}

      <div className="rotate-note">请横屏体验桥梁工地</div>
    </div>
  );
}

function modeLabel(mode: UIState['mode']) {
  if (mode === 'build') return '施工模式';
  if (mode === 'test') return '动态试车';
  if (mode === 'success') return '验收通过';
  return '等待补强';
}
