# 公开素材规则

- 除非用户明确指定某张形象图片可以上传，否则一切新增皮肤、肖像和自定义形象图片都只保存在本机，不提交、不推送，也不放入 GitHub 发布包。
- 本机皮肤存放在 `data/skins/`；该目录保持 Git 忽略。不要用 `git add -f` 绕过忽略规则。
- 公开仓库默认只保留原项目已有的四个小鲸鱼素材：`vendor/dsh-whale-widget/assets/DSH2.png`、`DSniang02.png`、`DSniang1.png`、`rua.gif`。增加其他图片前必须有用户针对具体图片的明确授权。
- 发布前检查 Git 跟踪文件和压缩包内容，确认没有 `data/skins/`、`skins/`、肖像或其他私人形象；本机私人安装包不可上传。
