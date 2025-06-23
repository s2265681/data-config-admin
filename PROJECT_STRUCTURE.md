# Data Config Admin - 项目结构说明

## 📁 项目概述

Data Config Admin 是一个基于文件夹的配置文件管理系统，支持在 AWS S3 和 GitHub 仓库之间进行双向同步。项目采用 Serverless 架构，使用 AWS Lambda 函数处理 S3 事件，实现配置文件的自动化管理。

## 🏗️ 完整项目结构

```
data-config-admin/
├── 📁 .github/                          # GitHub 相关配置
│   └── 📁 workflows/                     # GitHub Actions 工作流
│       ├── 📄 github-to-s3-staging-sync.yml    # Staging环境同步工作流
│       └── 📄 github-to-s3-production-sync.yml # Production环境同步工作流
│
├── 📁 .serverless/                       # Serverless Framework 部署缓存
│
├── 📁 app-config/                        # 应用程序配置文件目录
│   ├── 📁 config/                        # 主要配置文件
│   │   ├── 📁 staging/                   # Staging环境配置
│   │   │   ├── 📄 test.json              # 主要配置文件
│   │   │   ├── 📄 1.json                 # 新增配置文件
│   │   │   ├── 📄 2.json                 # 新增配置文件
│   │   │   └── 📄 test1-2.json           # 测试配置文件1-2
│   │   └── 📁 production/                # Production环境配置
│   │       ├── 📄 test.json              # 主要配置文件
│   │       ├── 📄 1.json                 # 新增配置文件
│   │       ├── 📄 2.json                 # 新增配置文件
│   │       └── 📄 test1-2.json           # 测试配置文件1-2
│   ├── 📁 config2/                       # 次要配置文件
│   │   ├── 📁 staging/                   # Staging环境配置
│   │   │   ├── 📄 test2.json             # 第二个配置文件
│   │   │   └── 📄 test3.json             # 第三个配置文件
│   │   └── 📁 production/                # Production环境配置
│   │       ├── 📄 test2.json             # 第二个配置文件
│   │       └── 📄 test3.json             # 第三个配置文件
│   └── 📁 config3/                       # 第三方配置文件
│       ├── 📁 staging/                   # Staging环境配置
│       │   └── 📄 test4.json             # 第四个配置文件
│       └── 📁 production/                # Production环境配置
│           └── 📄 test4.json             # 第四个配置文件
│
├── 📁 config/                            # 项目配置目录
│   ├── 📄 folders.json                   # 文件夹管理配置文件（核心配置）
│   └── 📄 README.md                      # 配置说明文档
│
├── 📁 handlers/                          # AWS Lambda 函数处理器
│   ├── 📄 s3-to-github.js                # S3到GitHub同步处理器（主要）
│   └── 📄 s3-to-github-production.js     # S3到GitHub同步处理器（生产环境专用）
│
├── 📁 node_modules/                      # Node.js 依赖包
│
├── 📁 plugins/                           # Serverless Framework 插件
│   └── 📄 dynamic-s3-events.js           # 动态S3事件配置插件
│
├── 📁 scripts/                           # 管理脚本目录
│   ├── 📄 deploy.js                      # 部署脚本（带配置验证）
│   ├── 📄 manage-folders.js              # 文件夹管理脚本
│   ├── 📄 migrate-to-folders.js          # 迁移到文件夹结构脚本
│   ├── 📄 monitor-folders-sync.js        # 监控文件夹同步状态脚本
│   ├── 📄 pull-from-s3.js                # 从S3拉取文件到GitHub脚本
│   ├── 📄 sync-folders-to-s3.js          # 同步文件夹到S3脚本
│   └── 📄 update-lambda.js               # 更新Lambda函数脚本
│
├── 📁 test/                              # 测试文件目录
│   └── 📄 sync.test.js                   # 同步功能测试文件
│
├── 📁 utils/                             # 工具类目录
│   ├── 📄 folder-manager.js              # 文件夹管理器（核心工具类）
│   └── 📄 generate-s3-arns.js            # S3 ARN生成器
│
├── 📄 .DS_Store                          # macOS系统文件
├── 📄 .gitignore                         # Git忽略文件配置
├── 📄 deploy.sh                          # 部署Shell脚本
├── 📄 env.example                        # 环境变量示例文件
├── 📄 FOLDER_MANAGEMENT.md               # 文件夹管理说明文档
├── 📄 package-lock.json                  # npm依赖锁定文件
├── 📄 package.json                       # 项目配置和依赖管理
├── 📄 README.md                          # 项目主要说明文档
├── 📄 response.json                      # 响应示例文件
├── 📄 SCRIPTS_USAGE.md                   # 脚本使用说明文档
├── 📄 serverless.yml                     # Serverless Framework 配置文件
├── 📄 SETUP.md                           # 项目设置说明文档
└── 📄 技术文档.md                        # 技术实现文档
```

## 🔧 核心组件说明

### 1. 配置文件管理 (`config/folders.json`)
```json
{
  "folders": [
    {
      "name": "config",                    // 文件夹名称
      "description": "主要配置文件",        // 文件夹描述
      "local_path_staging": "app-config/config/staging",      // Staging环境本地路径
      "local_path_production": "app-config/config/production", // Production环境本地路径
      "s3_prefix_staging": "config/staging",                  // Staging环境S3前缀
      "s3_prefix_production": "config/production",            // Production环境S3前缀
      "files": [                          // 监控的文件列表
        {
          "name": "test.json",            // 文件名
          "description": "主要配置文件"    // 文件描述
        }
      ]
    }
  ],
  "environments": {                       // 环境配置
    "staging": {
      "github_branch": "staging"          // Staging环境GitHub分支
    },
    "production": {
      "github_branch": "main"             // Production环境GitHub分支
    }
  }
}
```

### 2. Lambda 函数处理器 (`handlers/`)

#### `s3-to-github.js` - 主要同步处理器
- **功能**: 处理S3文件变更事件，同步到GitHub
- **触发条件**: S3文件创建、修改、删除事件
- **处理流程**: 
  1. 验证S3路径是否在监控范围内
  2. 提取文件信息和文件夹配置
  3. 根据环境确定GitHub目标路径
  4. 执行GitHub文件同步操作

#### `s3-to-github-production.js` - 生产环境专用处理器
- **功能**: 专门处理生产环境的S3到GitHub同步
- **特点**: 只处理production环境的文件变更
- **安全措施**: 额外的生产环境验证

### 3. 工具类 (`utils/`)

#### `folder-manager.js` - 文件夹管理器
- **功能**: 核心配置管理工具类
- **主要方法**:
  - `getFolders()`: 获取所有文件夹配置
  - `validateFoldersConfig()`: 验证配置有效性
  - `fileExists()`: 检查文件是否存在
  - `getFileHash()`: 获取文件哈希值
  - `readFile()`: 读取文件内容

#### `generate-s3-arns.js` - S3 ARN生成器
- **功能**: 根据文件夹配置动态生成S3权限ARN
- **用途**: 为Lambda函数生成精确的S3访问权限

### 4. 管理脚本 (`scripts/`)

#### `deploy.js` - 部署脚本
- **功能**: 带配置验证的完整部署
- **流程**: 验证配置 → 显示部署信息 → 执行Serverless部署

#### `sync-folders-to-s3.js` - 同步到S3脚本
- **功能**: 将本地文件夹同步到S3
- **特点**: 智能同步，只同步变更的文件

#### `pull-from-s3.js` - 从S3拉取脚本
- **功能**: 从S3拉取文件到GitHub仓库
- **用途**: 恢复或同步S3中的配置文件

#### `monitor-folders-sync.js` - 监控脚本
- **功能**: 监控本地、S3、GitHub三方的文件同步状态
- **输出**: 详细的同步状态报告

#### `manage-folders.js` - 文件夹管理脚本
- **功能**: 管理文件夹配置的增删改查
- **命令**: 验证、添加、删除、列出文件夹配置

### 5. Serverless 插件 (`plugins/`)

#### `dynamic-s3-events.js` - 动态S3事件插件
- **功能**: 根据文件夹配置动态生成S3事件规则
- **触发时机**: 部署前自动生成事件配置
- **优势**: 避免手动配置S3事件，减少配置错误

### 6. GitHub Actions 工作流 (`.github/workflows/`)

#### `github-to-s3-staging-sync.yml` - Staging环境同步
- **触发条件**: staging分支的app-config/**或config/folders.json变更
- **功能**: 自动同步staging环境配置到S3

#### `github-to-s3-production-sync.yml` - Production环境同步
- **触发条件**: main分支的app-config/**或config/folders.json变更
- **功能**: 自动同步production环境配置到S3

## 🔄 数据流向

### 1. GitHub → S3 同步流程
```
GitHub仓库 (app-config/) 
    ↓ (GitHub Actions)
本地文件系统
    ↓ (sync-folders-to-s3.js)
AWS S3 (rock-service-data/)
```

### 2. S3 → GitHub 同步流程
```
AWS S3 (rock-service-data/)
    ↓ (S3事件触发)
Lambda函数 (s3-to-github.js)
    ↓ (GitHub API)
GitHub仓库 (对应分支)
```

### 3. 监控和验证流程
```
本地文件系统
    ↓
monitor-folders-sync.js
    ↓
S3文件状态
    ↓
GitHub文件状态
    ↓
同步状态报告
```

## 🛠️ 技术栈

- **后端**: Node.js 18.x
- **云服务**: AWS Lambda, AWS S3
- **部署**: Serverless Framework
- **CI/CD**: GitHub Actions
- **版本控制**: Git
- **包管理**: npm

## 📋 环境变量配置

### 必需环境变量
```bash
# AWS配置
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-southeast-2

# GitHub配置
GITHUB_TOKEN=your_github_token
GITHUB_REPO=s2265681/data-config-admin

# S3配置
S3_BUCKET=rock-service-data
```

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp env.example .env
# 编辑 .env 文件，填入实际的配置值
```

### 3. 部署到AWS
```bash
npm run deploy-with-validation
```

### 4. 测试同步功能
```bash
# 同步到S3
npm run sync-to-s3

# 监控同步状态
npm run monitor
```

## 📚 相关文档

- [README.md](./README.md) - 项目主要说明
- [SETUP.md](./SETUP.md) - 详细设置指南
- [FOLDER_MANAGEMENT.md](./FOLDER_MANAGEMENT.md) - 文件夹管理说明
- [SCRIPTS_USAGE.md](./SCRIPTS_USAGE.md) - 脚本使用指南
- [技术文档.md](./技术文档.md) - 技术实现细节

## 🔍 故障排除

### 常见问题
1. **配置验证失败**: 检查 `config/folders.json` 格式
2. **权限错误**: 确认AWS和GitHub权限配置
3. **同步失败**: 查看Lambda函数日志
4. **文件冲突**: 使用监控脚本检查文件状态

### 日志查看
```bash
# 查看Lambda函数日志
serverless logs -f s3ToGithubSync --tail

# 查看GitHub Actions日志
# 在GitHub仓库的Actions页面查看
```

---

*最后更新: 2024年12月* 