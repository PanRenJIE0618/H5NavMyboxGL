# H5 导航语音播报设计

Date: 2026-09-07  
Status: approved（用户：可以）

## Goal

以 H5 Web Speech API 为底座，在导航过程中播报路径概要、逐段指引与状态（偏航/重规划/到达）。

## Approach

`src/lib/navVoice.js` 封装 `speechSynthesis`；NavMap 在关键节点调用。后续可替换为云端 TTS，保持 `speak/stop/setMuted` 接口。

## Triggers（导航中）

| 时机 | 内容示例 |
|------|----------|
| 开始导航 | 开始驾车导航，全程约 18 公里，预计 17 分钟 |
| nextGuide 变化 | 天地图指引原文 |
| 偏航 | 已偏离规划路线 |
| 重规划中 / 完成 | 正在重新规划 / 已重新规划路线 |
| 到达 | 已到达目的地 |
| 结束导航 | stop |

## Policy

- `voiceEnabled` 默认 true  
- `voiceRate` 默认 1  
- `voiceLang` 默认 `zh-CN`

## UI

导航相关区域提供静音开关；静音后停止当前播报。
