import { useState } from 'react';

// ---------------------------------------------------------------------------
// 形成性评价中心 —— 申报素材用的可截图原型（示例数据，非实时联机）。
// 独立于游戏正统软件，但复用游戏的视觉语言。四个页签对应申报主线：
//   1. AI 形成性评价：多模态可视 + AI 归因反馈 + 预测/实际元认知 + 老师点评
//   2. 成长轨迹（Git 式）：新手错误 → 师生点评 → 迭代修正的全过程
//   3. 作品广场：真实桥型封面 + 社会化点赞/同伴互评
//   4. 知识图谱：已点亮能力 + 补充学习路径 + 进阶路径指引
// ---------------------------------------------------------------------------

// 动物头像（Twemoji, CC-BY 4.0，已本地归档于 src/avatars/）。
const avatarUrls = import.meta.glob('./avatars/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const avatar = (animal: string) => avatarUrls[`./avatars/${animal}.svg`];

type Person = { name: string; sub: string; animal: string; teacher?: boolean };
// 化名：动作/颜色 + 动物，名字与头像动物一致，不暴露真实姓名。指导教师 = 冷酷的猫。
const PEOPLE = {
  zhiyao: { name: '飞奔的狐狸', sub: '土木 2304', animal: 'fox' },
  mubai: { name: '灰白的狼', sub: '土木 2303', animal: 'wolf' },
  yang: { name: '滚滚的熊猫', sub: '土木 2305', animal: 'panda' },
  suyan: { name: '火红的老虎', sub: '土木 2304', animal: 'tiger' },
  yuanzhou: { name: '跳跳的兔子', sub: '土木 2303', animal: 'rabbit' },
  linchuan: { name: '沉默的狗熊', sub: '土木 2305', animal: 'bear' },
  nanqiao: { name: '机敏的仓鼠', sub: '土木 2304', animal: 'hamster' },
  shenli: { name: '摇摆的企鹅', sub: '土木 2305', animal: 'penguin' },
  prof: { name: '冷酷的猫', sub: '指导教师', animal: 'cat', teacher: true },
  ta: { name: '憨厚的考拉', sub: '助教', animal: 'koala', teacher: true },
} satisfies Record<string, Person>;
type PersonKey = keyof typeof PEOPLE;
const person = (k: PersonKey): Person => PEOPLE[k];

type Tab = 'panel' | 'growth' | 'gallery' | 'graph';
const TABS: Array<{ key: Tab; label: string; caption: string }> = [
  { key: 'panel', label: 'AI 形成性评价', caption: '多模态 · 归因反馈' },
  { key: 'growth', label: '成长轨迹', caption: 'Git 迭代 · 师生点评' },
  { key: 'gallery', label: '作品广场', caption: '社会化 · 同伴互评' },
  { key: 'graph', label: '知识图谱', caption: '已点亮 · 学习路径' },
];

export function AssessmentCenter({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('panel');
  return (
    <div className="assess-overlay" role="dialog" aria-modal="true" aria-label="形成性评价中心">
      <div className="assess-shell">
        <header className="assess-top">
          <div className="assess-brand">
            <span className="assess-mark" aria-hidden="true">◑</span>
            <div>
              <p className="eyebrow">AI · FORMATIVE ASSESSMENT</p>
              <h2>形成性评价中心</h2>
            </div>
          </div>
          <nav className="assess-tabs" aria-label="评价视图">
            {TABS.map((t) => (
              <button key={t.key} className={`assess-tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}>
                <b>{t.label}</b>
                <small>{t.caption}</small>
              </button>
            ))}
          </nav>
          {onClose && <button className="assess-close" onClick={onClose} aria-label="关闭评价中心">✕</button>}
        </header>
        <div className="assess-body">
          {tab === 'panel' && <AssessmentPanel />}
          {tab === 'growth' && <GrowthTrack />}
          {tab === 'gallery' && <WorkGallery />}
          {tab === 'graph' && <SkillGraph />}
        </div>
      </div>
    </div>
  );
}

// ---- 通用头像 / 评论条 ----
function Avatar({ who, size = 36 }: { who: Person; size?: number }) {
  return (
    <span className={`avatar ${who.teacher ? 'is-teacher' : ''}`} style={{ width: size, height: size }}>
      <img src={avatar(who.animal)} alt={who.name} />
    </span>
  );
}

type Note = { who: PersonKey; stars?: number; text: string; likes?: number };
function CommentItem({ note }: { note: Note }) {
  const p = person(note.who);
  return (
    <li className={`note ${p.teacher ? 'note-teacher' : ''}`}>
      <Avatar who={p} size={34} />
      <div className="note-body">
        <div className="note-top">
          <span className="note-name">{p.name}</span>
          {p.teacher && <em className="role-badge">{p.sub.includes('助教') ? '助教' : '教师'}</em>}
          <span className="note-role">{p.sub}</span>
          {note.stars && <span className="note-stars">{'★'.repeat(note.stars)}<span className="star-dim">{'★'.repeat(5 - note.stars)}</span></span>}
        </div>
        <p>{note.text}</p>
        {note.likes != null && <span className="note-like">♥ {note.likes}</span>}
      </div>
    </li>
  );
}

// ===========================================================================
// 视图 1：AI 形成性评价面板
// ===========================================================================
const RADAR_DIMS = ['通过性', '经济性', '受力效率', '安全裕度', '创新性'];
const RADAR_SELF = [100, 86, 92, 64, 80];
const RADAR_CLASS = [88, 71, 70, 78, 58];

const SCORE_ROWS: Array<{ label: string; value: string; ratio: number; tone: 'safe' | 'warn' | 'danger' | 'teal' }> = [
  { label: '是否通过荷载', value: '通过 · 重型卡车', ratio: 1, tone: 'safe' },
  { label: '建造成本', value: '4 980 / 5 800（低于班级中位 9%）', ratio: 0.86, tone: 'teal' },
  { label: '峰值受力利用率', value: '0.92（接近极限，材料高效）', ratio: 0.92, tone: 'warn' },
  { label: '主梁抗弯利用率', value: '0.61（以斜拉索传力为主）', ratio: 0.61, tone: 'teal' },
  { label: '安全裕度', value: '0.08（偏低，建议补强）', ratio: 0.2, tone: 'danger' },
];
const PREDICT_ROWS: Array<{ q: string; predict: string; actual: string; hit: 'hit' | 'miss' }> = [
  { q: '能否通过卡车？', predict: '能', actual: '通过', hit: 'hit' },
  { q: '最先到达极限的构件？', predict: '边跨背索', actual: '主梁跨中（0.92）', hit: 'miss' },
  { q: '跨中竖向位移约？', predict: '约 8 cm', actual: '实测 11 cm', hit: 'miss' },
];
const AI_FEEDBACK: Array<{ tag: string; tone: string; text: string }> = [
  { tag: '效率', tone: 'teal', text: '峰值利用率 0.92 而未破坏——材料几乎用到极致，经济性优秀；代价是安全裕度仅 0.08。' },
  { tag: '受力', tone: 'ink', text: '主梁利用率 0.61 < 缆索 0.92，传力以斜拉索为主，符合斜拉桥的受力逻辑。' },
  { tag: '元认知', tone: 'coral', text: '你预测「背索最先破坏」，实际是「主梁跨中」最危险——下次请关注移动荷载下的弯矩包络。' },
  { tag: '下一步', tone: 'amber', text: '在跨中将梁高 54→60，W 提升约 23%，安全裕度可回到 0.2，仅增成本约 4%。' },
];

function AssessmentPanel() {
  return (
    <div className="panel-grid">
      <section className="ac-card panel-id">
        <div className="panel-id-head">
          <div className="panel-id-who">
            <Avatar who={PEOPLE.zhiyao} size={46} />
            <div>
              <p className="eyebrow">学生作品 · #A-2317</p>
              <h3>锦绣斜拉桥 · 第 6 版</h3>
              <p className="panel-meta">{PEOPLE.zhiyao.name} · {PEOPLE.zhiyao.sub} · 荷载：重型卡车</p>
            </div>
          </div>
          <span className="verdict verdict-pass">通过 PASSED</span>
        </div>
        <RadarChart dims={RADAR_DIMS} self={RADAR_SELF} cls={RADAR_CLASS} />
        <div className="radar-legend"><span><i className="dot-self" />本人作品</span><span><i className="dot-class" />班级平均</span></div>
        <div className="overall">
          <div className="stars" aria-label="综合 4 星">★★★★<span className="star-dim">★</span></div>
          <p>综合评定 <b>88</b> / 100 · 班级前 <b>15%</b></p>
        </div>
      </section>

      <section className="ac-card panel-scores">
        <h4 className="ac-head">多维度评分</h4>
        <ul className="score-list">
          {SCORE_ROWS.map((row) => (
            <li key={row.label}>
              <div className="score-row-top"><span>{row.label}</span><b>{row.value}</b></div>
              <div className="score-track"><i className={`tone-${row.tone}`} style={{ transform: `scaleX(${row.ratio})` }} /></div>
            </li>
          ))}
        </ul>
        <h4 className="ac-head">截面 A · I · W 解读</h4>
        <div className="aiw-mini">
          <div><span>面积 A</span><b>1.00</b><small>自重基准</small></div>
          <div><span>惯性矩 I</span><b>0.86</b><small>刚度 ∝ 高³</small></div>
          <div><span>截面模量 W</span><b>0.79</b><small>抗弯 ∝ 高²</small></div>
          <p className="aiw-note">当前：箱梁 · 梁高 54 · 等截面。箱梁把材料移向上下缘，用更小自重换更高抗弯效率。</p>
        </div>
      </section>

      <section className="ac-card panel-meta-col">
        <h4 className="ac-head">预测 vs 实际 <small className="ac-sub">元认知自评</small></h4>
        <div className="predict-table">
          {PREDICT_ROWS.map((row) => (
            <div key={row.q} className={`predict-row predict-${row.hit}`}>
              <span className="predict-q">{row.q}</span>
              <span className="predict-vals"><em>预测：{row.predict}</em><em>实际：{row.actual}</em></span>
              <span className="predict-flag">{row.hit === 'hit' ? '✓ 命中' : '✕ 偏差'}</span>
            </div>
          ))}
          <p className="predict-summary">预测命中 1 / 3。落差最大处正是本次的学习增长点。</p>
        </div>
        <h4 className="ac-head">AI 归因反馈 <small className="ac-sub">实时生成</small></h4>
        <ul className="feedback-list">
          {AI_FEEDBACK.map((f) => (
            <li key={f.tag}><span className={`fb-tag fb-${f.tone}`}>{f.tag}</span><p>{f.text}</p></li>
          ))}
        </ul>
        <h4 className="ac-head">老师点评 <small className="ac-sub">人工 · 终评</small></h4>
        <ul className="feedback-list note-list">
          <CommentItem note={{ who: 'prof', stars: 4, text: '从第 1 版「桥面没连通」一路改到等截面箱梁定稿，迭代逻辑清晰、会用 A·I·W 说话，难得。唯一要盯的是安全裕度——工程里不能把材料用到 0.92 还沾沾自喜。' }} />
        </ul>
      </section>
    </div>
  );
}

function RadarChart({ dims, self, cls }: { dims: string[]; self: number[]; cls: number[] }) {
  const size = 230, c = size / 2, r = c - 34, n = dims.length;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2, rr = (v / 100) * r;
    return [c + rr * Math.cos(a), c + rr * Math.sin(a)] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => point(i, v).join(',')).join(' ');
  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="多维度雷达图">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} className="radar-ring" points={Array.from({ length: n }, (_, i) => point(i, ring).join(',')).join(' ')} />
      ))}
      {dims.map((_, i) => { const [x, y] = point(i, 100); return <line key={i} className="radar-spoke" x1={c} y1={c} x2={x} y2={y} />; })}
      <polygon className="radar-area-class" points={poly(cls)} />
      <polygon className="radar-area-self" points={poly(self)} />
      {dims.map((d, i) => { const [x, y] = point(i, 122); return <text key={d} className="radar-label" x={x} y={y} textAnchor="middle" dominantBaseline="middle">{d}</text>; })}
    </svg>
  );
}

// ===========================================================================
// 视图 2：成长轨迹（Git 式迭代 + 新手错误 + 师生点评）
// ===========================================================================
type Commit = {
  id: string; ver: string; time: string; msg: string; score: number; delta: number;
  tags: string[]; mistake?: string; notes?: Note[];
};
const COMMITS: Commit[] = [
  { id: 'a1f3c0', ver: 'v1', time: '09-12 14:02', msg: '初版：桥面只搭了一半就点了加载', score: 28, delta: 0, tags: ['新手错误'],
    mistake: '桥面没有从西岸连续连到东岸，小车直接冲进河里。',
    notes: [{ who: 'ta', text: '别急着通车～先确认桥面从西岸一路连到东岸，中间不能断。' }] },
  { id: 'b7e221', ver: 'v2', time: '09-12 14:35', msg: '全用钢材堆满，结实但预算爆了', score: 33, delta: 5, tags: ['新手错误', '超预算'],
    mistake: '一上来所有构件都用最贵的钢材，预算 5 800 花了 7 200。',
    notes: [
      { who: 'suyan', text: '钢太贵啦💸 斜撑用木材就够，钢留给主受力构件。' },
      { who: 'prof', text: '材料要按受力分配：受拉优先缆索、受压短杆木材即可，别无脑堆钢。' },
    ] },
  { id: 'c0d934', ver: 'v3', time: '09-13 10:05', msg: '改木斜撑 + 实心梁，能过小汽车', score: 52, delta: 19, tags: ['梁太浅'],
    mistake: '梁高只有 33，换成卡车后跨中弯曲破坏。',
    notes: [{ who: 'mubai', text: '把梁高拉满试试？I 按高³ 长，挠度立刻变小。' }] },
  { id: 'd4aa18', ver: 'v4', time: '09-13 10:48', msg: '梁高拉到顶，过了卡车但又超预算', score: 47, delta: -5, tags: ['矫枉过正', '回退'],
    mistake: '一味加高实心梁，自重和成本同时飙升，回退了 5 分。',
    notes: [{ who: 'prof', text: '对，但别只会加高。想想箱梁——把材料移到上下缘，自重更小、W 更高。' }] },
  { id: 'e9b7f2', ver: 'v5', time: '09-14 19:20', msg: '改箱梁 + 跨中支座 → 两跨连续梁，成本骤降', score: 78, delta: 31, tags: ['箱梁', '连续梁', '降本'],
    notes: [
      { who: 'yang', text: '连续梁这招绝了，跨中弯矩直接砍半👍' },
      { who: 'ta', text: '很好，成本已进班级前 20%。' },
    ] },
  { id: 'f2c5a6', ver: 'v6', time: '09-15 20:11', msg: '微调截面，安全裕度与成本再平衡，定稿', score: 88, delta: 10, tags: ['定稿'],
    notes: [{ who: 'prof', text: '定稿合格。下一关挑战斜拉桥，重点关注塔顶两侧的索力平衡。' }] },
];

const MILESTONES: Array<{ icon: string; label: string; ver: string }> = [
  { icon: '🚗', label: '首次通车', ver: 'v3' },
  { icon: '🔁', label: '从失败中复盘', ver: 'v4' },
  { icon: '📦', label: '掌握箱梁', ver: 'v5' },
  { icon: '⚖️', label: '连续梁降本', ver: 'v5' },
  { icon: '🛡️', label: '裕度与成本平衡', ver: 'v6' },
  { icon: '🏆', label: '定稿达标', ver: 'v6' },
];

// 学习共同体：成员分工（社群性）。教师/助教 + 学生小组。
const TEAM_ROLES: Array<{ who: PersonKey; role: string }> = [
  { who: 'prof', role: '评价标准 · 终评把关' },
  { who: 'ta', role: '过程跟踪 · 日常答疑' },
  { who: 'suyan', role: '组长 · 桁架体系' },
  { who: 'zhiyao', role: '斜拉体系 · 迭代记录' },
  { who: 'yang', role: '拱桥体系 · 封面美术' },
  { who: 'mubai', role: '悬索体系 · 受力复核' },
  { who: 'yuanzhou', role: '经济性核算 · 预算审计' },
  { who: 'linchuan', role: '连续梁 · 资料整理' },
  { who: 'nanqiao', role: '数据可视化' },
  { who: 'shenli', role: '桁架体系 · 互评汇总' },
];

function TeamBand({ title, caption }: { title: string; caption: string }) {
  return (
    <section className="ac-card team-band">
      <div className="team-photo">
        <div className="photo-frame">
          <div className="photo-avatars">
            {TEAM_ROLES.map((r) => <Avatar key={r.who} who={person(r.who)} size={46} />)}
          </div>
          <p className="photo-caption">{caption}</p>
        </div>
      </div>
      <div className="team-roles">
        <h4 className="ac-head">{title} <small className="ac-sub">负责内容</small></h4>
        <ul className="role-list">
          {TEAM_ROLES.map((r) => {
            const p = person(r.who);
            return (
              <li key={r.who} className={p.teacher ? 'is-teacher' : ''}>
                <Avatar who={p} size={32} />
                <div className="role-text">
                  <span className="role-name">{p.name}{p.teacher && <em className="role-badge">{p.sub.includes('助教') ? '助教' : '教师'}</em>}</span>
                  <small>{r.role}</small>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function GrowthTrack() {
  return (
    <div className="stack-view">
    <div className="growth-grid">
      <section className="ac-card growth-chart-card">
        <div className="growth-hero"><Avatar who={PEOPLE.zhiyao} size={44} /><div><p className="eyebrow">成长档案</p><h3>{PEOPLE.zhiyao.name} · 梁桥关</h3></div></div>
        <h4 className="ac-head">综合得分曲线 <small className="ac-sub">6 次迭代</small></h4>
        <ScoreCurve commits={COMMITS} max={100} />
        <div className="growth-stats">
          <div><b>6</b><span>提交版本</span></div>
          <div><b>+60</b><span>累计提升</span></div>
          <div><b>3 天</b><span>迭代周期</span></div>
          <div><b>1</b><span>关键回退</span></div>
        </div>
        <p className="growth-insight">
          v4 因「一味加高」<strong>回退 5 分</strong>，v5 改用<strong>箱梁 + 连续梁</strong>大幅反弹 +31——
          失败被记录、被复盘、被纠正，正是成长型评价想捕捉的证据。
        </p>

        <h4 className="ac-head">里程碑 <small className="ac-sub">迭代中点亮</small></h4>
        <div className="milestones">
          {MILESTONES.map((m) => (
            <div key={m.label} className="milestone">
              <span className="ms-icon" aria-hidden="true">{m.icon}</span>
              <b>{m.label}</b>
              <small>{m.ver}</small>
            </div>
          ))}
        </div>

        <h4 className="ac-head">本关点亮能力 <small className="ac-sub">已沉淀到知识图谱</small></h4>
        <div className="skill-chips">
          {['截面 A·I·W', '弯矩与挠度', '箱梁截面', '连续梁与支座', '按受力分配材料', '成本控制'].map((s) => (
            <span key={s} className="skill-chip">✦ {s}</span>
          ))}
        </div>

        <h4 className="ac-head">教师阶段寄语 <small className="ac-sub">过程性 · 非终评</small></h4>
        <ul className="note-list">
          <CommentItem note={{ who: 'prof', text: '这条曲线我很喜欢：v4 摔了一跤没有放弃，而是回去想"为什么加高反而更差"。能从一次回退里读懂"自重 vs 抗弯"的权衡，比拿满分更重要。下一关把这股劲带去斜拉桥。' }} />
        </ul>
      </section>

      <section className="ac-card growth-log-card">
        <h4 className="ac-head">迭代日志 <small className="ac-sub">含新手错误与师生点评</small></h4>
        <ol className="commit-list">
          {COMMITS.slice().reverse().map((cmt) => (
            <li key={cmt.id} className="commit">
              <span className="commit-node" aria-hidden="true" />
              <div className="commit-body">
                <div className="commit-top">
                  <b>{cmt.ver}</b><code>{cmt.id}</code><time>{cmt.time}</time>
                  <span className={`commit-delta ${cmt.delta > 0 ? 'up' : cmt.delta < 0 ? 'down' : ''}`}>{cmt.delta > 0 ? `+${cmt.delta}` : cmt.delta} 分</span>
                </div>
                <p className="commit-msg">{cmt.msg}</p>
                <div className="commit-tags">
                  {cmt.tags.map((t) => <span key={t} className={t === '新手错误' || t === '回退' || t === '超预算' || t === '梁太浅' || t === '矫枉过正' ? 'tag-mistake' : ''}>{t}</span>)}
                  <span className="commit-thumb"><BridgeCover variant={cmt.score < 40 ? 'beam' : cmt.score < 70 ? 'beam' : 'continuous'} mini /></span>
                </div>
                {cmt.mistake && <p className="commit-mistake"><b>新手错误</b>{cmt.mistake}</p>}
                {cmt.notes && <ul className="note-list mini">{cmt.notes.map((n, i) => <CommentItem key={i} note={n} />)}</ul>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
    <TeamBand title="互评学习小组" caption="📷 结构创新工作坊 · 第 3 组「梁桥突击队」" />
    </div>
  );
}

function ScoreCurve({ commits, max }: { commits: Commit[]; max: number }) {
  const w = 520, h = 170, padX = 30, padY = 20, n = commits.length;
  const x = (i: number) => padX + (i * (w - padX * 2)) / (n - 1);
  const y = (v: number) => padY + (1 - v / max) * (h - padY * 2);
  const line = commits.map((c, i) => `${x(i)},${y(c.score)}`).join(' ');
  const area = `${padX},${h - padY} ${line} ${x(n - 1)},${h - padY}`;
  return (
    <svg className="score-curve" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="得分曲线">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line className="curve-grid" x1={padX} y1={y(g)} x2={w - padX} y2={y(g)} />
          <text className="curve-axis" x={padX - 6} y={y(g)} textAnchor="end" dominantBaseline="middle">{g}</text>
        </g>
      ))}
      <polygon className="curve-area" points={area} />
      <polyline className="curve-line" points={line} />
      {commits.map((c, i) => (
        <g key={c.id}>
          <circle className={`curve-dot ${c.delta < 0 ? 'dot-down' : ''}`} cx={x(i)} cy={y(c.score)} r={5} />
          <text className="curve-ver" x={x(i)} y={h - 4} textAnchor="middle">{c.ver}</text>
        </g>
      ))}
    </svg>
  );
}

// ===========================================================================
// 视图 3：作品广场（真实桥型封面 + 点赞/评论 + 同伴互评）
// ===========================================================================
type Cover = 'beam' | 'continuous' | 'truss' | 'arch' | 'cableStayed' | 'suspension';
type Work = {
  id: string; author: PersonKey; type: string; cover: Cover; cost: number; eff: number;
  stars: number; likes: number; comments: Note[]; flag?: string;
};
const WORKS: Work[] = [
  { id: 'A-2155', author: 'suyan', type: '桁架桥', cover: 'truss', cost: 3980, eff: 0.95, stars: 4.9, likes: 132, flag: '班级标杆',
    comments: [
      { who: 'prof', stars: 5, text: '三角形闭合、传力干净，0.95 的利用率还留了裕度，教科书级。', likes: 41 },
      { who: 'yang', stars: 5, text: '上弦压、下弦拉分得清清楚楚，学到了！', likes: 12 },
      { who: 'nanqiao', stars: 5, text: '想问下你斜撑角度是怎么定的？', likes: 3 },
    ] },
  { id: 'A-2317', author: 'zhiyao', type: '斜拉桥', cover: 'cableStayed', cost: 4980, eff: 0.92, stars: 4.6, likes: 86,
    comments: [
      { who: 'suyan', stars: 4, text: '利用率 0.92 还能过，材料用得真狠；不过裕度太低，真桥不敢这么修。', likes: 18 },
      { who: 'mubai', stars: 5, text: '边跨背索和主跨索平衡得好，塔顶几乎没偏。', likes: 9 },
      { who: 'prof', stars: 4, text: '经济性突出，但请把安全裕度提到 0.2 再交。', likes: 22 },
    ] },
  { id: 'A-2401', author: 'yang', type: '系杆拱', cover: 'arch', cost: 4630, eff: 0.81, stars: 4.7, likes: 98,
    comments: [
      { who: 'zhiyao', stars: 5, text: '拱矢比接近 1/5，拱肋几乎纯压，漂亮。', likes: 14 },
      { who: 'ta', stars: 4, text: '系杆受拉，记得校核它的利用率。', likes: 6 },
    ] },
  { id: 'A-2208', author: 'mubai', type: '悬索桥', cover: 'suspension', cost: 5120, eff: 0.88, stars: 4.4, likes: 74,
    comments: [
      { who: 'linchuan', stars: 4, text: '主缆垂跨比看着很舒服，吊索受力均匀。', likes: 7 },
      { who: 'prof', stars: 4, text: '边跨锚索到位，水平力平衡做对了。', likes: 15 },
    ] },
  { id: 'A-2290', author: 'yuanzhou', type: '连续梁', cover: 'continuous', cost: 3560, eff: 0.74, stars: 4.1, likes: 53,
    comments: [
      { who: 'suyan', stars: 4, text: '跨中支座用得好，最省钱的那一个👍', likes: 11 },
      { who: 'ta', stars: 4, text: '成本控制优秀，可再压一点主梁高。', likes: 4 },
    ] },
  { id: 'A-2333', author: 'linchuan', type: '斜拉桥', cover: 'cableStayed', cost: 5410, eff: 0.69, stars: 3.6, likes: 22, flag: '新手作品',
    comments: [
      { who: 'zhiyao', stars: 3, text: '你边跨好像没拉背索？塔顶偏移会很大哦。', likes: 8 },
      { who: 'prof', stars: 3, text: '典型新手问题：主跨索没有边跨背索来平衡。补上背索再测一次。', likes: 19 },
      { who: 'linchuan', text: '收到！这就去加背索 🙏', likes: 5 },
    ] },
  { id: 'A-2120', author: 'nanqiao', type: '梁桥', cover: 'beam', cost: 2980, eff: 0.58, stars: 3.4, likes: 18, flag: '新手作品',
    comments: [
      { who: 'mubai', stars: 3, text: '梁太浅了，跨中挠度肉眼可见地大。', likes: 6 },
      { who: 'ta', stars: 3, text: '试试加高或换箱梁，I 长得很快。', likes: 4 },
    ] },
  { id: 'A-2377', author: 'shenli', type: '桁架桥', cover: 'truss', cost: 4210, eff: 0.86, stars: 4.3, likes: 61,
    comments: [
      { who: 'yang', stars: 4, text: '稳！就是个别杆件略有冗余，可再省。', likes: 9 },
      { who: 'suyan', stars: 5, text: '节点处理得干净。', likes: 5 },
    ] },
];

function WorkGallery() {
  const [active, setActive] = useState(0);
  const work = WORKS[active];
  return (
    <div className="gallery-wrap">
      <section className="ac-card gallery-list-card">
        <div className="gallery-head">
          <h4 className="ac-head">作品广场 <small className="ac-sub">本周 · 共 126 件</small></h4>
          <div className="gallery-filters">{['综合最佳', '最经济', '最高效率', '最受好评', '最新提交'].map((f, i) => <button key={f} className={i === 0 ? 'is-active' : ''}>{f}</button>)}</div>
        </div>
        <div className="work-grid">
          {WORKS.map((w, i) => {
            const p = person(w.author);
            return (
              <button key={w.id} className={`work-card ${i === active ? 'is-active' : ''}`} onClick={() => setActive(i)} aria-pressed={i === active}>
                <div className="work-cover">
                  <BridgeCover variant={w.cover} />
                  {w.flag && <span className={`work-flag ${w.flag === '新手作品' ? 'flag-novice' : 'flag-top'}`}>{w.flag}</span>}
                  <span className="work-typebadge">{w.type}</span>
                </div>
                <div className="work-info">
                  <div className="work-author"><Avatar who={p} size={26} /><b>{p.name}</b><small>{p.sub}</small></div>
                  <div className="work-chips"><span>￥{w.cost}</span><span>效率 {w.eff}</span><span className="chip-star">★ {w.stars}</span></div>
                  <div className="work-social"><span>♥ {w.likes}</span><span>💬 {w.comments.length}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ac-card gallery-detail-card">
        <h4 className="ac-head">同伴互评 <small className="ac-sub">#{work.id} · {work.type}</small></h4>
        <div className="detail-hero"><BridgeCover variant={work.cover} /></div>
        <div className="detail-meta">
          <span className="detail-author"><Avatar who={person(work.author)} size={30} /><b>{person(work.author).name}</b>{person(work.author).sub}</span>
          <span>成本 <b>￥{work.cost}</b></span>
          <span>效率 <b>{work.eff}</b></span>
          <span className="detail-star">★ {work.stars}</span>
          <span className="detail-social">♥ {work.likes} · 💬 {work.comments.length}</span>
        </div>
        <ul className="note-list">{work.comments.map((n, i) => <CommentItem key={i} note={n} />)}</ul>
        <div className="peer-compose"><input placeholder="写下你的点评，给一条可操作的建议…" readOnly /><button className="primary-button">发布点评</button></div>
      </section>
    </div>
  );
}

// 桥型封面 —— 游戏风格的场景缩略图（天空/水面/岸/结构体系）。
function BridgeCover({ variant, mini = false }: { variant: Cover; mini?: boolean }) {
  const hangers = (cx0: number, cx1: number, topY: (x: number) => number) => {
    const xs: number[] = [];
    for (let x = cx0; x <= cx1; x += 18) xs.push(x);
    return xs.map((x) => <line key={x} className="cov-hanger" x1={x} y1={topY(x)} x2={x} y2={80} />);
  };
  return (
    <svg className={`bridge-cover ${mini ? 'mini' : ''}`} viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${variant} 封面`}>
      <rect className="cov-sky" x="0" y="0" width="200" height="120" />
      <circle className="cov-sun" cx="168" cy="22" r="11" />
      <g className="cov-cloud"><circle cx="40" cy="24" r="8" /><circle cx="52" cy="24" r="10" /><circle cx="64" cy="24" r="7" /></g>
      <rect className="cov-water" x="0" y="92" width="200" height="28" />
      <polygon className="cov-bank" points="0,70 34,80 34,120 0,120" />
      <polygon className="cov-bank" points="200,70 166,80 166,120 200,120" />

      {variant === 'beam' && <><rect className="cov-girder" x="34" y="80" width="132" height="7" /><line className="cov-deck" x1="34" y1="80" x2="166" y2="80" /></>}
      {variant === 'continuous' && <><line className="cov-pier" x1="100" y1="80" x2="100" y2="100" /><rect className="cov-girder" x="34" y="80" width="132" height="6" /><line className="cov-deck" x1="34" y1="80" x2="166" y2="80" /></>}
      {variant === 'truss' && <>
        <line className="cov-truss" x1="40" y1="58" x2="160" y2="58" />
        {[40, 64, 88, 112, 136, 160].map((x) => <line key={x} className="cov-truss" x1={x} y1="58" x2={x} y2="80" />)}
        {[[40, 64], [88, 64], [88, 112], [136, 112], [136, 160]].map(([a, b], i) => <line key={i} className="cov-truss" x1={a} y1="58" x2={b} y2="80" />)}
        <line className="cov-deck" x1="34" y1="80" x2="166" y2="80" />
      </>}
      {variant === 'arch' && <>
        <path className="cov-rib" d="M40 80 Q100 30 160 80" fill="none" />
        {hangers(52, 148, (x) => 80 - (1 - Math.pow((x - 100) / 60, 2)) * 50)}
        <line className="cov-deck" x1="34" y1="80" x2="166" y2="80" />
      </>}
      {variant === 'cableStayed' && <>
        <line className="cov-tower" x1="72" y1="80" x2="72" y2="26" />
        <line className="cov-tower" x1="128" y1="80" x2="128" y2="26" />
        {[44, 56, 88, 100].map((x) => <line key={`l${x}`} className="cov-cable" x1="72" y1="28" x2={x} y2="80" />)}
        {[112, 100, 144, 156].map((x) => <line key={`r${x}`} className="cov-cable" x1="128" y1="28" x2={x} y2="80" />)}
        <line className="cov-cable" x1="72" y1="28" x2="36" y2="80" />
        <line className="cov-cable" x1="128" y1="28" x2="164" y2="80" />
        <line className="cov-deck" x1="34" y1="80" x2="166" y2="80" />
      </>}
      {variant === 'suspension' && <>
        <line className="cov-tower" x1="50" y1="82" x2="50" y2="24" />
        <line className="cov-tower" x1="150" y1="82" x2="150" y2="24" />
        <path className="cov-cable" d="M50 24 Q100 78 150 24" fill="none" />
        <line className="cov-cable" x1="50" y1="24" x2="14" y2="86" />
        <line className="cov-cable" x1="150" y1="24" x2="186" y2="86" />
        {hangers(62, 138, (x) => 24 + (1 - Math.pow((x - 100) / 50, 2)) * 54)}
        <line className="cov-deck" x1="34" y1="80" x2="166" y2="80" />
      </>}
    </svg>
  );
}

// ===========================================================================
// 视图 4：知识图谱（已点亮 + 补充路径 + 进阶路径）
// ===========================================================================
type NodeState = 'mastered' | 'progress' | 'remedial' | 'advanced';
type GNode = { id: string; label: string; x: number; y: number; state: NodeState };
const G_NODES: GNode[] = [
  { id: 'balance', label: '力的平衡', x: 9, y: 20, state: 'mastered' },
  { id: 'tc', label: '拉与压', x: 9, y: 50, state: 'mastered' },
  { id: 'section', label: '截面 A·I·W', x: 9, y: 80, state: 'mastered' },
  { id: 'triangle', label: '三角形稳定', x: 35, y: 16, state: 'mastered' },
  { id: 'bending', label: '弯矩与挠度', x: 35, y: 50, state: 'mastered' },
  { id: 'beam', label: '梁桥设计', x: 35, y: 82, state: 'mastered' },
  { id: 'truss', label: '桁架传力', x: 62, y: 13, state: 'mastered' },
  { id: 'arch', label: '拱的轴压', x: 62, y: 38, state: 'remedial' },
  { id: 'continuous', label: '连续梁与支座', x: 62, y: 62, state: 'progress' },
  { id: 'economy', label: '经济性与预算', x: 62, y: 86, state: 'remedial' },
  { id: 'cable', label: '斜拉索-塔平衡', x: 90, y: 18, state: 'progress' },
  { id: 'suspension', label: '主缆与锚固', x: 90, y: 42, state: 'advanced' },
  { id: 'envelope', label: '移动荷载弯矩包络', x: 90, y: 66, state: 'advanced' },
  { id: 'safety', label: '安全裕度与可靠度', x: 90, y: 90, state: 'advanced' },
];
type EdgeKind = 'normal' | 'remedial' | 'advance';
const G_EDGES: Array<[string, string, EdgeKind?]> = [
  ['balance', 'triangle'], ['tc', 'triangle'], ['section', 'bending'], ['section', 'beam'],
  ['bending', 'beam'], ['bending', 'continuous'], ['triangle', 'truss'], ['beam', 'continuous'],
  ['tc', 'arch', 'remedial'], ['beam', 'economy', 'remedial'],
  ['truss', 'cable'], ['beam', 'cable'], ['continuous', 'safety', 'advance'],
  ['arch', 'suspension', 'advance'], ['cable', 'suspension', 'advance'], ['cable', 'envelope', 'advance'],
  ['bending', 'envelope', 'advance'], ['economy', 'safety', 'advance'], ['cable', 'safety', 'advance'],
];
const STATE_LABEL: Record<NodeState, string> = { mastered: '已点亮', progress: '进行中', remedial: '建议补充', advanced: '进阶推荐' };

const BADGES: Array<{ icon: string; name: string; got: boolean }> = [
  { icon: '🚗', name: '首次通车', got: true },
  { icon: '🔺', name: '三角达人', got: true },
  { icon: '📦', name: '箱梁大师', got: true },
  { icon: '⚖️', name: '连续梁高手', got: true },
  { icon: '💰', name: '节俭工程师', got: true },
  { icon: '🌉', name: '斜拉入门', got: true },
  { icon: '🪢', name: '悬索宗师', got: false },
  { icon: '🛡️', name: '裕度守护者', got: false },
  { icon: '🏆', name: '满收集', got: false },
];
// 盲点互助：可向 TA 求助（同学掌握了你尚缺的）/ 你可帮助 TA（你已点亮、他们还缺的）
const AID_ASK: Array<{ topic: string; who: PersonKey[] }> = [
  { topic: '拱的轴压', who: ['yang', 'suyan'] },
  { topic: '经济性与预算', who: ['yuanzhou'] },
  { topic: '悬索主缆与锚固', who: ['mubai'] },
];
const AID_HELP: Array<{ topic: string; who: PersonKey[] }> = [
  { topic: '桁架传力', who: ['shenli', 'linchuan'] },
  { topic: '截面 A·I·W', who: ['nanqiao'] },
  { topic: '箱梁截面', who: ['shenli'] },
];

function AidList({ items }: { items: Array<{ topic: string; who: PersonKey[] }> }) {
  return (
    <ul className="aid-list">
      {items.map((it) => (
        <li key={it.topic}>
          <div className="aid-topic">{it.topic}</div>
          <div className="aid-people">
            {it.who.map((k) => <span key={k} className="aid-person"><Avatar who={person(k)} size={24} />{person(k).name}</span>)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SkillGraph() {
  const find = (id: string) => G_NODES.find((n) => n.id === id)!;
  const masteredCount = G_NODES.filter((n) => n.state === 'mastered').length;
  const gotBadges = BADGES.filter((b) => b.got).length;
  return (
    <div className="stack-view">
    <div className="graph-grid">
      <section className="ac-card graph-canvas-card">
        <h4 className="ac-head">能力图谱 <small className="ac-sub">{PEOPLE.zhiyao.name} · 已点亮 {masteredCount} / {G_NODES.length} 个概念</small></h4>
        <div className="graph-canvas">
          <svg className="graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {G_EDGES.map(([a, b, kind], i) => {
              const na = find(a), nb = find(b);
              return <line key={i} className={`edge edge-${kind ?? 'normal'}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          {G_NODES.map((n) => (
            <div key={n.id} className={`gnode gnode-${n.state}`} style={{ left: `${n.x}%`, top: `${n.y}%` }}>
              <span className="gnode-icon" aria-hidden="true">{n.state === 'mastered' ? '★' : n.state === 'progress' ? '◐' : n.state === 'remedial' ? '!' : '↗'}</span>
              <span className="gnode-label">{n.label}</span>
            </div>
          ))}
        </div>
        <div className="graph-legend">
          {(['mastered', 'progress', 'remedial', 'advanced'] as NodeState[]).map((s) => (
            <span key={s} className={`leg leg-${s}`}><i />{STATE_LABEL[s]}</span>
          ))}
          <span className="leg leg-line-remedial"><i />补充路径</span>
          <span className="leg leg-line-advance"><i />进阶路径</span>
        </div>
      </section>

      <section className="ac-card graph-side-card">
        <div className="graph-progress">
          <div className="ring" style={{ ['--p' as string]: masteredCount / G_NODES.length }}><b>{Math.round((masteredCount / G_NODES.length) * 100)}%</b></div>
          <p>能力树点亮 <b>{masteredCount} / {G_NODES.length}</b><small>梁桥 / 桁架 / 截面体系已扎实</small></p>
        </div>

        <h4 className="ac-head path-remedial-head">建议补充 <small className="ac-sub">先补短板</small></h4>
        <ul className="path-list">
          <li className="path-remedial"><b>拱的轴压</b><small>拱桥关得分 62，拱肋出现明显弯矩——回看「轴压 vs 弯矩」一节。</small></li>
          <li className="path-remedial"><b>经济性与预算</b><small>3 次提交超预算——练习「按受力分配材料」。</small></li>
        </ul>

        <h4 className="ac-head path-advance-head">进阶路径 <small className="ac-sub">下一步挑战</small></h4>
        <ol className="path-list path-steps">
          <li className="path-advance"><span>1</span><div><b>斜拉索-塔平衡</b><small>进行中：主跨索与边跨背索的塔顶平衡。</small></div></li>
          <li className="path-advance"><span>2</span><div><b>主缆与锚固</b><small>悬索桥：主缆下锚边跨、平衡水平力。</small></div></li>
          <li className="path-advance"><span>3</span><div><b>移动荷载弯矩包络</b><small>理解最不利荷载位置与包络设计。</small></div></li>
          <li className="path-advance"><span>4</span><div><b>安全裕度与可靠度</b><small>从「能过」走向「可靠地过」。</small></div></li>
        </ol>
      </section>
    </div>

    <section className="ac-card gamify-band">
      <div className="gamify-stats">
        <div><b>1 280</b><span>学习积分</span></div>
        <div><b>7 / 14</b><span>概念收集</span></div>
        <div><b>{gotBadges} / {BADGES.length}</b><span>勋章解锁</span></div>
        <div><b>64%</b><span>全班概念覆盖</span></div>
      </div>
      <div className="gamify-badges">
        <h4 className="ac-head">勋章墙 <small className="ac-sub">满收集进度 {gotBadges} / {BADGES.length}</small></h4>
        <div className="badge-wall">
          {BADGES.map((b) => (
            <div key={b.name} className={`badge ${b.got ? 'got' : 'locked'}`}>
              <span className="badge-icon" aria-hidden="true">{b.got ? b.icon : '🔒'}</span>
              <small>{b.name}</small>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="ac-card aid-band">
      <div className="aid-col">
        <h4 className="ac-head aid-ask-head">可向 TA 求助 <small className="ac-sub">同学掌握了你的盲点</small></h4>
        <AidList items={AID_ASK} />
      </div>
      <div className="aid-col">
        <h4 className="ac-head aid-help-head">你可帮助 TA <small className="ac-sub">你已点亮、他们还缺</small></h4>
        <AidList items={AID_HELP} />
      </div>
    </section>

    <TeamBand title="能力共建小组" caption="📷 结构创新工作坊 · 第 3 组合影" />
    </div>
  );
}
