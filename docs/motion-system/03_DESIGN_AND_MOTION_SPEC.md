# 设计规范与动效规范

版本：v0.1
更新时间：2026-08-04

## 1. 品牌气质

核心感受：

- 暗色
- 高级
- 克制
- 科技感
- 可信赖
- 有结果导向

视觉隐喻：

- 求职不是玄学，而是一套可拆解、可推进、可复盘的系统。
- MoreThan 是陪跑者，也是“决策控制台”。

## 2. 色彩规范

基础色：

- 页面底色：#05070a
- 深层背景：#070b10
- 文字主色：#f4f7fb
- 文字次色：rgba(244, 247, 251, .64)

强调色：

- 冷蓝：#8bd8ff
- 暖橙：#ff6a2a
- 深绿蓝：#1ba784

使用规则：

- 冷蓝用于导航、标签、系统感。
- 暖橙用于焦点、关键结果、边缘光。
- 不大面积使用橙色，避免变成电商促销感。

## 3. 空间规范

页面：

- 版心：max 1700px
- 顶部导航高度：约 92px
- 页面主体高度：接近一个完整视口

层级：

- 背景素材墙：最底层，低透明度
- 环境光与扫描线：中间层
- 页面主体：最高层
- CTA 与二维码：应成为当前页面最清晰的焦点

## 4. 字体规范

中文字体：

- PingFang SC
- Microsoft YaHei
- system-ui fallback

字号方向：

- 首页 H1：76-88px
- 页面 H1：64-82px
- 卡片标题：24-30px
- 正文：17-20px

字距：

- 中文不使用负字距
- 英文 eyebrow 可以使用轻微大写字距

## 5. 动效原则

### 原则 1：页面先动，组件后动

先建立页面转场，再给组件补细节。

### 原则 2：焦点唯一

每一页只有一个主视觉焦点。不要让背景、卡片、按钮同时强烈运动。

### 原则 3：慢即高级

MoreThan 的动效要有镜头感，不追求短视频式快闪。

### 原则 4：真实可读

服务介绍和案例必须可读，动效不能抢内容。

## 6. 动效参数

CSS 变量建议：

```css
:root {
  --motion-page: 720ms;
  --motion-panel: 560ms;
  --motion-hover: 180ms;
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --ease-hover: cubic-bezier(.2, .8, .2, 1);
  --glow-blue: rgba(139, 216, 255, .38);
  --glow-orange: rgba(255, 106, 42, .42);
}
```

## 7. 页面转场规范

进入：

- opacity: 0 -> 1
- transform: translateY(28px) scale(.985) -> none
- filter: blur(10px) -> blur(0)

离开：

- opacity: 1 -> 0
- transform: translateY(-12px) scale(.992)
- duration: 220-320ms

如果不引入 Framer Motion，第一版可只做进入态，通过 React key 重挂载页面完成。

## 8. 组件动效规范

服务卡：

- delay stagger: 80ms
- hover border glow
- no bounce

案例：

- 编号先出现
- 标题后出现
- 横向光线扫过一次

社群：

- 信息点依次点亮
- 背景可有慢速关键词流

关于我们：

- 数字递增
- 成员逐个浮现

联系我们：

- 二维码区域稳定高亮
- CTA 呼吸光 3-4 秒一轮

## 9. 减少动效模式

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```
