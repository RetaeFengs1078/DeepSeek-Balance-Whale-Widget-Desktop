# AI 开发说明

本 fork 的新增功能主要由 **OpenAI Codex（AI）** 根据 **RetaeFengs1078** 提出的需求编写，并由 Codex 在 Windows 上构建、测试和调试。具体包括：

- 从本机 Codex 会话日志读取额度，识别 5 小时和每周窗口；
- 在独立桌面鲸鱼中显示中文额度信息，并加入刷新和显示开关；
- 打包 Windows 程序，加入安装、卸载及开机自启动功能；
- 调整额度数字与气泡轮廓的出现时序。
- 修复小尺寸下菜单图标部分区域点击无效的问题。
- 加入 VS Code / ChatGPT 启动联动，并将其改为可选功能；默认恢复鲸鱼开机自启动。
- 为 Codex 客户端、VS Code 插件和可登录的 Remote SSH 主机实现对话完成提醒、来源区分及中文提示。
- 为 Chrome 和 Edge 编写 ChatGPT 网页完成提醒扩展及本机通信接口，继续使用鲸鱼气泡和小黄鸭音效。
- 为完成提醒气泡加入点击返回：网页激活原有标签页，Codex 客户端和 VS Code 激活已有窗口。
- 将 Windows 透明窗口裁剪到鲸鱼可见区域，减少网页视频播放时的覆盖干扰；仅在需要文字输入的菜单中允许窗口获得焦点。

RetaeFengs1078 提出需求、提供反馈并维护这个 GitHub fork。AI 参与开发的声明不改变原项目的版权或许可：鲸鱼插件来自 [MeteorNOX](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)，独立桌面版来自 [GoRmiTz](https://github.com/GoRmiTz/DeepSeek-Balance-Whale-Widget-Desktop)。对应的 MIT 许可及署名仍见 `LICENSE`、`NOTICE` 和 `vendor/dsh-whale-widget/` 中的文件。
