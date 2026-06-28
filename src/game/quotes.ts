export type BridgeQuote = {
  /** Primary line shown to the player (Chinese). */
  text: string;
  /** Original-language line, shown small underneath when present. */
  en?: string;
  /** Author — only set when the attribution is verified. Omitted for unverified lines. */
  author?: string;
  /** A few words: who they are / where it is from. Only shown alongside a verified author. */
  brief?: string;
};

// Bridge quotations cycled on each load test.
// Lines with a confident, checked source carry an author + brief.
// Lines we could not verify are kept (they are good lines) but shown WITHOUT an author,
// so the game never asserts a false attribution.
export const QUOTES: BridgeQuote[] = [
  // --- verified attribution ---
  {
    text: '人是一座桥，而非终点。',
    en: 'What is great in man is that he is a bridge and not an end.',
    author: '尼采',
    brief: '哲学家 ·《查拉图斯特拉如是说》',
  },
  {
    text: '桥并非只是连接已然分开的两岸——是桥，才让两岸成其为两岸。',
    author: '海德格尔',
    brief: '哲学家 ·《筑·居·思》1951',
  },
  {
    text: '拱，是两处弱点相互支撑，合成一处坚强。',
    en: 'An arch consists of two weaknesses which, leaning one against the other, make a strength.',
    author: '达·芬奇',
    brief: '文艺复兴巨匠 ·《手稿》',
  },
  {
    text: '力学，是数学诸科的乐园。',
    en: 'Mechanics is the paradise of the mathematical sciences.',
    author: '达·芬奇',
    brief: '文艺复兴巨匠',
  },
  {
    text: '形式追随失败——工程的进步，源于对失败的理解。',
    en: 'Form follows failure.',
    author: '亨利·波卓斯基',
    brief: '工程史学者 ·《人为什么会犯错》',
  },
  {
    text: '最可能成为我们最恒久丰碑、把我们带向最遥远后世的，是一件纯然实用之物——不是神殿，不是堡垒，不是宫殿，而是一座桥。',
    en: 'A work of bare utility; not a shrine, not a fortress, not a palace, but a bridge.',
    author: '蒙哥马利·舒勒',
    brief: '建筑评论家 · 1883 论布鲁克林大桥',
  },
  {
    text: '至此，伟大的使命完成。',
    en: 'At last the mighty task is done.',
    author: '约瑟夫·施特劳斯',
    brief: '金门大桥总工程师 · 同名诗',
  },
  {
    text: '一桥飞架南北，天堑变通途。',
    author: '毛泽东',
    brief: '《水调歌头·游泳》1956',
  },
  {
    text: '长桥卧波，未云何龙？复道行空，不霁何虹？',
    author: '杜牧',
    brief: '唐 ·《阿房宫赋》',
  },
  {
    text: '枯藤老树昏鸦，小桥流水人家。',
    author: '马致远',
    brief: '元 ·《天净沙·秋思》',
  },

  // --- kept, but attribution unverified → shown without an author ---
  {
    text: '随便谁都能造出一座立得住的桥；唯有工程师，才能造出一座刚好立得住的桥。',
    en: 'Any idiot can build a bridge that stands, but it takes an engineer to build a bridge that barely stands.',
  },
  {
    text: '我，是由一千次失败堆砌而成的。',
    en: 'I am built of a thousand failures.',
  },
  {
    text: '若不曾为谁搭一座桥，这一天，便算是白过了。',
    en: 'I figure I lost a day unless I … built a bridge for someone.',
  },
  {
    text: '在空中托起一块石头这个简单的动作，本身就可以是一种表达。',
    en: 'The simple act of holding a stone in the air can be a matter of expression.',
  },
  {
    text: '形式不是被设计出来的，而是从结构中生长出来的。',
  },
  {
    text: '我从不相信有不可能的事——结构需要的是胆识，而非运气。',
  },
  {
    text: '桥梁不只跨越河流，也跨越时代。',
  },
  {
    text: '桥何名欤？曰：奋斗。',
  },
  {
    text: '所有的桥都是温暖的，因为它们不让河流难过。',
  },
];
