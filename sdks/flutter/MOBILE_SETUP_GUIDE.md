# EventsLog 远程服务器部署与本地 Flutter 自动插桩指南

本指南面向真实生产/测试场景：
- **远程服务器（云主机/公网服务器）**：部署 EventsLog 接收端与控制台，负责 24 小时收集所有手机上报的函数执行数据。
- **本地开发电脑**：使用本地的 `EventsLog` 源码对业务 Flutter 项目进行 0 代码侵入的自动插桩与打包发布。

---

## 整体协作与数据流向

```text
┌─────────────────────────────────┐
│ 外部所有手机 (iOS / Android)     │
│ 运行已插桩的 App                 │
└────────────────┬────────────────┘
                 │ 移动网络 (4G/5G/Wi-Fi) 上报 HTTP/HTTPS POST
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 远程云服务器 (Linux, 如 123.45.67.89 或 telemetry.domain.com)│
│                                                             │
│  - EventsLog 接收服务 (监听 8080 端口，存入 eventslog.db)    │
│  - Web 仪表盘 (监听 5173 端口，展示所有手机调用排行榜与耗时)   │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ 手机端 eventslog.yaml 中配置此远程服务器地址
                               │
┌──────────────────────────────┴──────────────────────────────┐
│ 本地开发电脑                                                │
│                                                             │
│  ├── EventsLog/sdks/flutter (本地仓库源码，提供 CLI 与 SDK)   │
│  └── my_flutter_app/        (业务项目，通过 CLI 自动插桩打包) │
└─────────────────────────────────────────────────────────────┘
```

---

## 第一部分：远程服务器部署（数据接收端）

在你的远程云服务器（如 Ubuntu / Debian / CentOS 云主机）上执行以下操作。

### 1. 编译并启动后台服务

将 `EventsLog` 仓库代码同步到服务器上，编译独立运行的单文件二进制服务：

```bash
cd EventsLog

# 1. 编译高性能 Release 二进制文件
cargo build --release -p eventslog-local --bin eventslog-local

# 2. 启动服务（默认监听 0.0.0.0:8080，使用轻量 SQLite 单文件存储）
./target/release/eventslog-local --port 8080 --db /data/eventslog.db
```

#### （推荐）配置 systemd 后台常驻守护进程
编辑 `/etc/systemd/system/eventslog.service`：
```ini
[Unit]
Description=EventsLog Telemetry Ingestion Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/data
ExecStart=/path/to/EventsLog/target/release/eventslog-local --port 8080 --db /data/eventslog.db
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
启动并设置开机自启：
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now eventslog
```

---

### 2. （可选）在服务器上启动 Web 仪表盘

在服务器上编译前端并启动控制台：

```bash
cd EventsLog/dashboard
pnpm install
pnpm build
# 启动常驻预览服务，监听 5173 端口
nohup pnpm preview --host 0.0.0.0 --port 5173 > /var/log/eventslog-dashboard.log 2>&1 &
```
浏览器打开 `http://<服务器公网IP>:5173` 即可查看图形化监控界面。

---

### 3. 验证远程服务就绪

在任意电脑或手机浏览器中访问：
```text
http://<服务器公网IP或域名>:8080/health
```
网页返回 `OK` 即表示远程服务器已具备接收手机上报的能力。
- **手机上报地址**：`http://<服务器公网IP或域名>:8080/v1/events/batch`
- （若服务器已前置 Nginx/HTTPS 反向代理至 8080，上报地址填 `https://你的域名/v1/events/batch`）

---

## 第二部分：本地 Flutter 项目自动插桩（核心重点）

本地开发电脑上同时拥有 `EventsLog` 源码与你的业务 Flutter 工程：

```text
my_workspace/
├── EventsLog/            # 本地 EventsLog 仓库
└── my_flutter_app/       # 你的本地业务 Flutter 工程
```

### 1. 本地准备插桩 CLI 工具

在本地电脑的 `EventsLog/sdks/flutter` 目录下完成编译并注册为全局命令：

```bash
cd EventsLog/sdks/flutter
npm install
npm run build

# 注册为本地全局命令 eventslog-flutter
npm link
```

---

### 2. 在业务 Flutter 工程中引入本地 SDK

打开本地业务工程 `my_flutter_app/pubspec.yaml`，使用 `path` 依赖本地 SDK：

```yaml
dependencies:
  flutter:
    sdk: flutter

  # 指向本地电脑上的 EventsLog SDK 源码
  eventslog_flutter:
    path: ../EventsLog/sdks/flutter
```

在业务工程根目录下更新依赖：
```bash
cd ../my_flutter_app
flutter pub get
```

---

### 3. 配置上报地址与监控规则（eventslog.yaml）

在业务 Flutter 项目根目录下创建 `eventslog.yaml`，把 `endpoint` 指向部署好的**远程服务器**：

```yaml
eventslog:
  service_name: "my-flutter-app"
  environment: "production"

  # 🌟 填写第一部分中部署好的远程服务器地址：
  endpoint: "http://<服务器公网IP>:8080/v1/events/batch"
  # 若配置了 HTTPS 域名则填: "https://telemetry.yourdomain.com/v1/events/batch"

  # 手机端缓冲与批量策略（积攒 50 条或每 2 秒批量上报，不阻塞手机主线程）
  batch_size: 50
  flush_interval_ms: 2000

  # 记录函数入参和返回值
  capture_arguments: true
  capture_returns: true

  # 🎯 包含规则：指定你要统计哪些业务函数
  include:
    - "lib/services/**"              # 统计 services 目录下的所有函数
    - "OrderService.*"               # 统计 OrderService 类下的全部函数
    - "PaymentService.processPay"    # 统计指定函数

  # 排除规则
  exclude:
    - "*_test.dart"
    - "*.g.dart"
    - "*.freezed.dart"
```

---

### 4. 执行自动插桩与打包发布

开发者的业务代码（如 `OrderService`、`PaymentService`）**完全不需要改动任何代码，不需要手写埋点，也不需要 import SDK**。

#### 场景 A：本地调试（连接真实手机）
```bash
# 自动注入探针 -> 编译并安装到手机运行 -> 调试退出时 100% 自动还原源码
eventslog-flutter run -- flutter run
```

#### 场景 B：正式打包（发布给所有手机用户）
```bash
# 打包 Android APK
eventslog-flutter run -- flutter build apk --release

# 打包 iOS
eventslog-flutter run -- flutter build ipa --release
```

**自动生命周期机制**：
1. **构建前**：CLI 自动解析 Dart AST 语法树，自动给命中的业务函数包装上计时与数据采集探针，原文件自动备份至 `.eventslog_backup/`；
2. **构建中**：Flutter 编译器将带探针的代码编译打包进安装包；
3. **构建后**：CLI 自动触发还原，将所有 Dart 源码恢复原状，删除备份目录，**Git 工作区 0 代码残留（Zero Git Diff）**。

---

### 5. 源码插桩前后对比（全自动化执行）

当你执行插桩打包时，CLI 自动完成以下代码改写，打包完成后立刻自动还原：

#### 原始业务代码（开发者日常维护）：
```dart
// lib/services/order_service.dart
class OrderService {
  Future<Order> createOrder(String userId, double amount) async {
    final response = await api.submit(userId, amount);
    return Order.fromJson(response);
  }
}
```

#### 编译期自动生成的带探针代码（打包时由 CLI 注入）：
```dart
// @eventslog:instrumented
import 'package:eventslog_flutter/eventslog.dart';

class OrderService {
  Future<Order> createOrder(String userId, double amount) async {
    return EventsLog.runWithSpan(
      functionName: 'OrderService.createOrder',
      className: 'OrderService',
      filePath: 'lib/services/order_service.dart',
      arguments: {'userId': userId, 'amount': amount},
      body: () async {
        final response = await api.submit(userId, amount);
        return Order.fromJson(response);
      },
    );
  }
}
```

---

## 第三部分：数据查看与验证

当安装包分发到任意手机上，用户打开 App 并触发相关业务操作后，数据会自动通过移动网络推送到你的远程服务器。

### 1. 远程 Web 仪表盘查看
在浏览器访问远程服务器控制台：`http://<服务器公网IP>:5173`
- **函数调用排行榜**：查看哪些函数调用次数最多、失败率最高；
- **耗时分布与慢函数定位**：P50 / P95 / P99 纳秒级响应耗时；
- **真实调用明细**：查看每一次手机调用的具体入参、返回值和异常报错堆栈。

### 2. 远程服务器数据库直接查询
在服务器终端直接查询 SQLite 数据库：
```bash
sqlite3 /data/eventslog.db "
  SELECT 
    function_name, 
    COUNT(*) AS total_calls, 
    ROUND(AVG(duration_nanos)/1000000.0, 2) AS avg_ms,
    SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS error_count
  FROM function_executions 
  GROUP BY function_name 
  ORDER BY total_calls DESC;
"
```
