# Gumroad 商业化最佳实践配置指南 (Gumroad Best Practices)

> 本文档规范 **MCP Dynamic Router (Commercial Pro Edition)** 在 Gumroad 平台的官方配置规范，严格遵循海外商业化规程。

---

## 1. 单二进制分级权益 (Single Binary, Tiered Entitlement)
- **交付包**：统一上传混淆加固的独立压缩包 `mcp-router-pro-v1.0.0.zip`。
- **权益区分**：
  - 代码内部完全一致，席位与权限通过 Gumroad 云端 Uses 额度以及收据/EULA 控制。
  - 用户激活码由 Gumroad 动态派发，支持在线鉴权或离线 Ed25519 机器码绑定。

---

## 2. Versions（版本）差额计价铁律
在 Gumroad 商品后台的 `Versions` 列表中配置：
- **基础定价 (Base Price)**: `$29`
- **版本 1：Solo Pro (1 Developer / up to 3 devices)**
  - Name: `Solo Pro License`
  - Additional amount: `0` (默认基础价 **$29**)
- **版本 2：Team Enterprise (Up to 10 Seats + Priority Support)**
  - Name: `Team Enterprise License`
  - Additional amount: **`50`** (最终售价 $29 + $50 = **$79**)

> ⚠️ **警告**：Gumroad 的 `Additional amount` 是在 Base Price 之上的追加金额，切勿将团队版售价直接填成 79，否则总价会变成 $29 + $79 = $108。

---

## 3. 主推版本置顶 (Default Tier at #1)
- 在 Gumroad 后台 Versions 编辑区，将 `Solo Pro License ($29)` 拖动置于第 1 位。
- 确保客户访问产品主页（`https://gumroad.com/l/mcp-router-pro`）时，默认显示主推的低门槛个人版价格。

---

## 4. 席位倍率开关保持关闭
- `Allow customers to choose number of seats per license` 必须保持 **关闭 (OFF)**。
- 避免 Gumroad 在结账时按席位数自动将订单金额乘倍扣费，降低结账放弃率。

---

## 5. 动态 License Key 模块必须插入
- 进入商品后台 `Content`（交付）标签页：
- 点击 `Insert ∨ -> License key`，在交付页面中嵌入动态授权卡片。
- 买家付款成功后，Gumroad 将全自动为该笔订单派发唯一的激活码。
- 引导买家在终端执行：
  ```bash
  mcp-router activate <LICENSE_KEY>
  ```
