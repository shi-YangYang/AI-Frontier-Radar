# Plan

- 后端：`deleteAllAdminWatchAccounts`（逐个级联删除）+ `POST /admin/api/watch-accounts/delete-all`；`startUserWechatBind` 单绑定校验（409）；`GET /user/api/wechat` sources 补 `sourceUrl`/`xUsername`；同步认领逻辑只认领一个无主账号。
- 前端：新增 `source-labels.ts`（友好名称 + 分组，供监听源页与绑定端共用）；监听源页改用友好名并加「全部删除」；绑定端按组渲染并禁用重复绑定。
- 测试：smoke 增加「每个用户只能绑定一个微信号」「一键删除全部监听源」；实机截图核对监听源页与绑定端。

## 风险

- 一键删除不可恢复，依赖确认框；文档已说明。
