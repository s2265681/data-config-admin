# Data Config Admin - 多环境多文件配置同步系统

一个强大的AWS S3和GitHub仓库配置文件双向同步系统，支持多环境（staging/production）和多文件管理。

## 🚀 功能特性

- **多环境支持**: 支持staging和production环境独立同步
- **多文件管理**: 统一管理多个JSON配置文件
- **智能同步**: 只同步发生变化的文件
- **双向同步**: S3 ↔ GitHub 自动双向同步
- **详细日志**: 完整的同步日志和状态监控
- **文件验证**: JSON格式验证和错误处理
- **文件夹管理**: 基于文件夹的配置组织结构

## 📁 项目结构

```
data-config-admin/
├── configuration/          # 配置文件统一管理目录
│   ├── config/            # 配置文件夹1
│   │   └── test.json
│   ├── config2/           # 配置文件夹2
│   │   ├── test2.json
│   │   └── test3.json
│   └── config3/           # 配置文件夹3
│       └── test4.json
├── config/
│   ├── folders.json       # 文件夹管理配置
│   └── README.md          # 配置说明文档
├── scripts/               # 脚本目录
│   ├── sync-folders-to-s3.js        # 文件夹同步到S3
│   ├── sync-s3-to-local-folders.js  # S3同步到本地文件夹
│   ├── monitor-folders-sync.js      # 文件夹同步状态监控
│   ├── manage-folders.js            # 文件夹管理工具
│   ├── deploy.js                    # 部署脚本
│   ├── update-lambda.js             # Lambda更新脚本
│   └── migrate-to-folders.js        # 迁移工具
├── handlers/
│   └── s3-to-local-folders.js       # S3到本地文件夹同步处理器
├── utils/
│   ├── file-manager.js              # 文件管理工具
│   └── folder-manager.js            # 文件夹管理工具
├── serverless.yml                   # Serverless配置
├── package.json                     # 项目依赖
└── SCRIPTS_USAGE.md                 # 脚本使用文档
```

## 🔧 配置说明

### 文件夹管理配置 (`config/folders.json`)

```json
{
  "folders": [
    {
      "name": "config",
      "description": "主要配置文件",
      "local_path": "configuration/config",
      "s3_prefix": "config/staging",
      "files": [
        {
          "name": "test.json",
          "description": "测试配置文件"
        }
      ]
    },
    {
      "name": "config2",
      "description": "次要配置文件",
      "local_path": "configuration/config2",
      "s3_prefix": "config2/staging",
      "files": [
        {
          "name": "test2.json",
          "description": "第二个测试配置"
        },
        {
          "name": "test3.json",
          "description": "第三个测试配置"
        }
      ]
    }
  ]
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

### 3. 验证配置

```bash
npm run manage-folders validate
```

### 4. 部署Lambda函数

```bash
npm run deploy-with-validation
```

### 5. 测试同步

```bash
# 同步文件夹到S3
npm run sync-to-s3

# 监控同步状态
npm run monitor
```

## 📋 使用指南

### 核心命令

| 命令 | 功能 | 说明 |
|------|------|------|
| `npm run deploy` | 标准部署 | 部署整个项目到AWS |
| `npm run deploy-with-validation` | 验证部署 | 部署前验证配置 |
| `npm run sync-to-s3` | 同步到S3 | 将本地文件夹同步到S3 |
| `npm run sync-from-s3` | 从S3同步 | 从S3同步到本地文件夹 |
| `npm run monitor` | 监控状态 | 检查同步状态 |
| `npm run manage-folders` | 管理文件夹 | 管理文件夹配置 |
| `npm run update-lambda` | 更新Lambda | 快速更新函数代码 |

### 详细使用说明

📖 **完整脚本使用文档**: 请查看 [SCRIPTS_USAGE.md](./SCRIPTS_USAGE.md) 获取详细的使用说明和示例。

### 添加新配置文件

1. 使用管理工具添加文件：
   ```bash
   npm run manage-folders add-file
   ```

2. 或者手动在 `config/folders.json` 中添加配置

3. 同步到S3：
   ```bash
   npm run sync-to-s3
   ```

### 同步操作

#### 手动同步

```bash
# 同步到S3
npm run sync-to-s3

# 从S3同步回本地
npm run sync-from-s3

# 监控同步状态
npm run monitor
```

#### 自动同步流程

1. **本地 → S3**: 手动运行 `npm run sync-to-s3`
2. **S3 → 本地**: 当S3中的文件发生变化时，Lambda函数自动同步到本地文件夹

## 🔄 同步流程

### 文件夹结构映射

- **本地路径**: `configuration/config/`
- **S3路径**: `s3://rock-service-data/config/staging/`
- **文件映射**: 按文件夹结构自动映射

### 智能同步特性

- **哈希比较**: 基于文件哈希，只同步变更的文件
- **文件夹结构**: 保持完整的文件夹结构
- **详细日志**: 提供详细的同步日志和状态报告

## 📊 监控和日志

### 同步状态监控

```bash
npm run monitor
```

输出示例：
```
📊 同步状态分析
================
✅ 成功: 3 个文件
❌ 失败: 0 个文件
⏭️  跳过: 1 个文件

✅ 成功同步的文件:
   📄 test.json → config/staging/test.json (新增)
   📄 test2.json → config/staging/test2.json (变更)
```

### Lambda日志查看

```bash
# 查看同步Lambda日志
serverless logs -f s3ToLocalFoldersSync --tail
```

## 🛠️ 故障排除

### 常见问题

1. **配置验证失败**
   ```bash
   npm run manage-folders validate
   ```

2. **同步失败**
   ```bash
   # 检查AWS凭证
   aws sts get-caller-identity
   
   # 检查环境变量
   echo $AWS_REGION
   echo $S3_BUCKET
   ```

3. **Lambda函数问题**
   ```bash
   # 查看日志
   serverless logs -f s3ToLocalFoldersSync --tail
   
   # 更新函数
   npm run update-lambda
   ```

## 📚 相关文档

- [脚本使用文档](./SCRIPTS_USAGE.md) - 详细的脚本使用说明
- [配置管理文档](./config/README.md) - 配置文件管理说明
- [文件夹管理文档](./FOLDER_MANAGEMENT.md) - 文件夹管理功能说明

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 📄 许可证

MIT License


1、 管理 当前文件中的配置文件， 当配置文件触发时， 会自动同步到配置中心

2、 当test.json 对应 s3 的 s3://rock-service-data/config/  当staging 文件发生变化， 同步到 staging 分支， production 中文件发生变化， 同步 main 分支


## 测试阶段
手动上传 test.json

aws s3 cp test.json s3://rock-service-data/config/staging/test.json

查看日志
npx serverless logs -f s3ToGithubSync --tail


查看同步状态 
npm run monitor-multi


多文件监控

测试 case

1、修改test.json 文件在s3中只更新这一个文件， 其他文件不更新， 同样修改了test.json git 中也只有这一个的更新记录， 并且提交信息为 test.json 进行了修改 



新增监控的文件， 修改filter monitoring 然后使用下面命令进行更新
npm run deploy-with-config
