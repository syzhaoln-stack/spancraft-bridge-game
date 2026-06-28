import { useMemo } from 'react';

type Props = {
  onStartBlueprint: () => void;
  onStartEmpty: () => void;
  onClose: () => void;
};

const sprite = (name: string) => `${import.meta.env.BASE_URL}assets/sprites/${name}`;

// Geometry of the living cable-stayed hero scene, in SVG user units (viewBox 880 x 300).
const DECK_Y = 201;
const TOWER_TOP_Y = 66;
const TOWER_X = [266, 614];
const WATER_Y = 250;

type Cable = { x1: number; y1: number; x2: number; y2: number; delay: number };

function buildCables(): Cable[] {
  const cables: Cable[] = [];
  // Draw the fan from the centre outward so the bridge "blooms" into existence.
  for (let i = 1; i <= 5; i += 1) {
    for (const tx of TOWER_X) {
      for (const side of [-1, 1]) {
        const x2 = tx + side * (i * 38 + 8);
        cables.push({ x1: tx, y1: TOWER_TOP_Y, x2, y2: DECK_Y, delay: i * 0.14 });
      }
    }
  }
  return cables;
}

function towerPoints(tx: number) {
  return [
    `${tx - 3},${TOWER_TOP_Y}`,
    `${tx + 3},${TOWER_TOP_Y}`,
    `${tx + 10},${DECK_Y}`,
    `${tx + 8},${WATER_Y + 2}`,
    `${tx - 8},${WATER_Y + 2}`,
    `${tx - 10},${DECK_Y}`,
  ].join(' ');
}

export function IntroSheet({ onStartBlueprint, onStartEmpty, onClose }: Props) {
  const cables = useMemo(buildCables, []);

  return (
    <div className="intro-backdrop">
      <section className="intro-sheet" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <button className="intro-close" onClick={onClose} aria-label="关闭说明">×</button>

        <div className="hero-stage" aria-hidden="true">
          <svg className="hero-svg" viewBox="0 0 880 300" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#c6e8e1" />
                <stop offset="0.5" stopColor="#9ed7d5" />
                <stop offset="1" stopColor="#f8d9a1" />
              </linearGradient>
              <linearGradient id="hero-water" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3f8b97" />
                <stop offset="1" stopColor="#274f5d" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="880" height="300" fill="url(#hero-sky)" />
            <circle className="hero-sun" cx="706" cy="80" r="34" fill="#f8eccf" />

            <g className="hero-clouds" fill="#f8f0da" opacity="0.82">
              <ellipse cx="150" cy="78" rx="34" ry="13" />
              <ellipse cx="190" cy="70" rx="24" ry="11" />
              <ellipse cx="520" cy="120" rx="30" ry="11" />
              <ellipse cx="556" cy="114" rx="20" ry="9" />
            </g>

            <g className="hero-hills">
              <polygon points="-20,205 170,118 360,205" fill="#6f9298" opacity="0.5" />
              <polygon points="250,205 470,92 700,205" fill="#587b88" opacity="0.45" />
              <polygon points="560,205 770,132 920,205" fill="#6f9298" opacity="0.5" />
            </g>

            <rect x="0" y={WATER_Y} width="880" height={300 - WATER_Y} fill="url(#hero-water)" />
            <g className="hero-shimmer" stroke="#cdeae3" strokeWidth="2" strokeLinecap="round" opacity="0.4">
              {Array.from({ length: 7 }, (_, row) => (
                <line
                  key={row}
                  x1={70 + (row % 3) * 30}
                  y1={262 + row * 5}
                  x2={150 + (row % 3) * 30}
                  y2={262 + row * 5}
                />
              ))}
            </g>

            {/* abutments */}
            <rect x="20" y={DECK_Y - 4} width="26" height="60" fill="#3a5d68" />
            <rect x="834" y={DECK_Y - 4} width="26" height="60" fill="#3a5d68" />

            {/* pylons (behind the cable fan) */}
            {TOWER_X.map((tx) => (
              <polygon key={tx} points={towerPoints(tx)} fill="#4a6b76" stroke="#1c3a44" strokeWidth="1.5" />
            ))}

            {/* the cable fan draws itself in */}
            <g className="hero-cables" stroke="#efc85a" strokeWidth="1.7" fill="none" strokeLinecap="round">
              {cables.map((c, i) => (
                <line
                  key={i}
                  x1={c.x1}
                  y1={c.y1}
                  x2={c.x2}
                  y2={c.y2}
                  pathLength={1}
                  style={{ animationDelay: `${c.delay}s` }}
                />
              ))}
            </g>

            {/* pylon caps over the convergence point */}
            {TOWER_X.map((tx) => (
              <circle key={tx} cx={tx} cy={TOWER_TOP_Y} r="3.4" fill="#f4e8c4" />
            ))}

            {/* deck */}
            <rect x="36" y={DECK_Y} width="808" height="9" fill="#f2e6c4" />
            <rect x="36" y={DECK_Y} width="808" height="3" fill="#fff4d8" />

            {/* traffic, kept inside the SVG so it stays glued to the deck */}
            <image
              className="hero-car"
              href={sprite('sedan.png')}
              x="0"
              y={DECK_Y - 19}
              width="46"
              height="20"
            />
            <g className="hero-ped">
              <image className="ped-f1" href={sprite('man_walk1.png')} x="0" y={DECK_Y - 26} width="18" height="26" preserveAspectRatio="xMidYMax meet" />
              <image className="ped-f2" href={sprite('man_walk2.png')} x="0" y={DECK_Y - 26} width="18" height="26" preserveAspectRatio="xMidYMax meet" />
            </g>
            <g className="hero-ped hero-ped-2">
              <image className="ped-f1" href={sprite('woman_walk1.png')} x="0" y={DECK_Y - 25} width="18" height="25" preserveAspectRatio="xMidYMax meet" />
              <image className="ped-f2" href={sprite('woman_walk2.png')} x="0" y={DECK_Y - 25} width="18" height="25" preserveAspectRatio="xMidYMax meet" />
            </g>
          </svg>

          <span className="hero-tag">斜拉桥 · CABLE-STAYED</span>
        </div>

        <div className="intro-content">
          <p className="eyebrow">SPANCRAFT · 桥梁工程游戏</p>
          <h2 id="intro-title" className="intro-quote-title">
            “I figure I lost a day unless I … built a bridge for someone.”
          </h2>
          <p className="intro-lead">
            从一根桥面开始搭。试车时构件会由绿转黄、再到红——桥会告诉你下一根杆该加在哪里。
            不需要工程基础，看颜色就够了。
          </p>

          <div className="intro-rules">
            <div><span>拖</span><p><b>拖出构件</b><small>从圆形节点拖到任意位置</small></p></div>
            <div><span>看</span><p><b>看受力颜色</b><small>最先变红处最需要补强</small></p></div>
            <div><span>改</span><p><b>回场即改</b><small>桥断了也不丢设计</small></p></div>
          </div>

          <div className="intro-actions">
            <button className="primary-button" onClick={onStartBlueprint}>开始建造 · 装载示范桥</button>
            <button className="text-button" onClick={onStartEmpty}>空场地开始</button>
          </div>

          <p className="intro-credit">设计 <b>ColdCat</b> · szhao@djtu.edu.cn</p>
        </div>
      </section>
    </div>
  );
}
