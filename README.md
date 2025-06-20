# Data Config Admin - 多环境多文件配置同步系统

一个强大的AWS S3和GitHub仓库配置文件双向同步系统，支持多环境（staging/production）和多文件管理。

## 🚀 功能特性

- **多环境支持**: 支持staging和production环境独立同步
- **多文件管理**: 统一管理多个JSON配置文件
- **智能同步**: 只同步发生变化的文件
- **双向同步**: S3 ↔ GitHub 自动双向同步
- **详细日志**: 完整的同步日志和状态监控
- **文件验证**: JSON格式验证和错误处理

## 📁 项目结构

```
data-config-admin/
├── configuration/          # 配置文件统一管理目录
│   ├── test.json          # 主要配置文件
│   ├── test2.json         # 第二个配置文件
│   └── test3.json         # 第三个配置文件
├── config/
│   └── files.json         # 文件管理配置
├── scripts/
│   ├── sync-to-s3-multi.js        # 多文件同步到S3脚本
│   └── monitor-multi.js           # 多文件状态监控脚本
├── handlers/
│   └── s3-to-github-multi.js      # S3到GitHub多文件同步处理器
├── utils/
│   └── file-manager.js            # 文件管理工具
├── .github/workflows/
│   ├── github-to-s3-multi-sync.yml        # 多文件GitHub到S3同步工作流
│   └── github-to-s3-production-sync.yml   # 生产环境同步工作流
├── serverless.yml                 # Serverless配置
└── package.json                   # 项目依赖
```

## 🔧 配置说明

### 文件管理配置 (`config/files.json`)

```json
{
  "files": [
    {
      "name": "configuration/test.json",
      "description": "主要配置文件",
      "staging_path": "config/staging/test.json",
      "production_path": "config/production/test.json"
    },
    {
      "name": "configuration/test2.json",
      "description": "第二个配置文件",
      "staging_path": "config/staging/test2.json",
      "production_path": "config/production/test2.json"
    },
    {
      "name": "configuration/test3.json",
      "description": "第三个配置文件",
      "staging_path": "config/staging/test3.json",
      "production_path": "config/production/test3.json"
    }
  ],
  "environments": {
    "staging": {
      "s3_prefix": "config/staging/",
      "github_branch": "staging"
    },
    "production": {
      "s3_prefix": "config/production/",
      "github_branch": "main"
    }
  }
}
```

### 环境变量配置

创建 `.env` 文件：

```bash
# AWS配置
AWS_REGION=ap-southeast-2
S3_BUCKET=rock-service-data

# GitHub配置
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_REPO=s2265681/data-config-admin

# 其他配置
NODE_ENV=development
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

### 3. 部署Lambda函数

```bash
npm run deploy
```

### 4. 测试同步

```bash
# 同步所有文件到S3 staging
npm run sync-to-s3-multi

# 监控同步状态
npm run monitor-multi
```

## 📋 使用指南

### 添加新配置文件

1. 在 `configuration/` 文件夹中添加新的JSON文件
2. 在 `config/files.json` 中添加文件配置：

```json
{
  "name": "configuration/new-config.json",
  "description": "新配置文件",
  "staging_path": "config/staging/new-config.json",
  "production_path": "config/production/new-config.json"
}
```

### 同步操作

#### 手动同步到S3

```bash
# 同步到staging环境
npm run sync-to-s3-multi

# 同步到production环境
npm run sync-to-s3-production
```

#### 监控同步状态

```bash
npm run monitor-multi
```

### 自动同步流程

1. **GitHub → S3**: 当 `configuration/` 文件夹中的文件发生变化时，GitHub Actions自动同步到S3
2. **S3 → GitHub**: 当S3中的文件发生变化时，Lambda函数自动同步到GitHub

## 🔄 同步流程

### Staging环境
- **GitHub分支**: `staging`
- **S3路径**: `s3://rock-service-data/config/staging/`
- **触发条件**: 推送到 `staging` 分支

### Production环境
- **GitHub分支**: `main`
- **S3路径**: `s3://rock-service-data/config/production/`
- **触发条件**: 推送到 `main` 分支

## 📊 监控和日志

### 同步状态监控

```bash
npm run monitor-multi
```

输出示例：
```
🔍 开始监控多文件同步状态...

📁 检查文件: test.json (configuration/test.json)
  ✅ 本地: 存在
  ☁️  S3 Staging: 存在
  ☁️  S3 Production: 存在
  🐙 GitHub Staging: 存在
  🐙 GitHub Production: 存在

📊 同步状态分析:
================

📄 test.json:
  🔄 Staging: ✅ - 完全同步
  🚀 Production: ✅ - 完全同步

📂 文件结构:
============
configuration/
  ├── test.json
  ├── test2.json
  └── test3.json
```

### 日志格式

同步日志包含以下信息：
- 文件名称和路径
- 同步方向（S3 ↔ GitHub）
- 环境信息（staging/production）
- 时间戳
- 文件哈希值
- 错误信息（如果有）

## 🛠️ 开发指南

### 本地开发

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 本地测试同步
npm run sync-to-s3-multi
```

### 添加新的同步逻辑

1. 在 `scripts/` 文件夹中添加新的同步脚本
2. 在 `handlers/` 文件夹中添加新的Lambda处理器
3. 更新 `package.json` 中的脚本命令
4. 更新 `serverless.yml` 配置

## 🔧 故障排除

### 常见问题

1. **GitHub Token权限不足**
   - 确保GitHub Personal Access Token有足够的权限
   - 检查token是否已过期

2. **S3权限问题**
   - 确保AWS凭证配置正确
   - 检查S3 bucket权限

3. **文件同步失败**
   - 检查文件路径配置
   - 验证JSON格式是否正确
   - 查看CloudWatch日志

### 调试命令

```bash
# 检查文件配置
node -e "console.log(require('./config/files.json'))"

# 测试文件管理器
node -e "const fm = require('./utils/file-manager'); console.log(fm.getFiles())"

# 检查环境变量
node -e "console.log(process.env.GITHUB_TOKEN ? 'Token exists' : 'Token missing')"
```

## 📝 更新日志

### v2.0.0 - 多文件支持
- ✅ 支持管理多个JSON配置文件
- ✅ 智能同步（只同步变更文件）
- ✅ 统一文件管理（configuration文件夹）
- ✅ 详细同步日志和状态监控

### v1.0.0 - 基础功能
- ✅ 单文件双向同步
- ✅ 多环境支持
- ✅ 自动部署和监控

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 支持

如有问题或建议，请创建 Issue 或联系维护者。


1、 管理 当前文件中的配置文件， 当配置文件触发时， 会自动同步到配置中心

2、 当test.json 对应 s3 的 s3://rock-service-data/config/  当staging 文件发生变化， 同步到 staging 分支， production 中文件发生变化， 同步 main 分支


## 测试阶段
手动上传 test.json

aws s3 cp test.json s3://rock-service-data/config/staging/test.json

查看日志
npx serverless logs -f s3ToGithubSync --tail


查看同步状态 
npm run monitor-multi