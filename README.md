# 桥造计划 · SpanCraft v1.0

一款受《Poly Bridge 3》启发的浏览器桥梁建造游戏。玩家可以搭建和修改桥面、木杆、钢杆与缆索，再用小汽车、重型卡车或通勤人群进行动态加载。

## 在线游玩

[打开 SpanCraft](https://syzhaoln-stack.github.io/spancraft-bridge-game/)

## 四个关卡

- 桁架桥：用连续三角形建立稳定的拉压路径。
- 系杆拱桥：观察具有转角刚度的拱肋如何承担压弯。
- 斜拉桥：平衡主跨斜拉索、边跨背索与贯通海床的主塔。
- 悬索桥：用边锚锁住主缆，并由吊杆和海床塔基共同传力。

## 本地运行

```powershell
npm install
npm run dev
```

## 验证

```powershell
npm run test:physics
npm run build
```

物理回归覆盖四种桥型、三种移动荷载、自动铰接、边锚连续性、压弯框架行为及海床基础。

> 本项目用于游戏体验和结构直觉教学，不能代替真实工程设计或安全验算。

## 素材许可

车辆、人物和音效来自 Kenney CC0 素材包，来源见 [ASSET_SOURCES.md](ASSET_SOURCES.md)。
