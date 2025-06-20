# Data Config Admin

双向同步AWS S3和GitHub仓库的配置文件管理系统

## 功能特性

- 🔄 **双向同步**: S3 ↔ GitHub 自动同步
- 📁 **文件监控**: 监控 `test.json` 文件变化
- 🚀 **自动触发**: 基于事件驱动的同步机制
- 🔒 **安全可靠**: 支持内容校验和冲突检测
- 📊 **日志记录**: 完整的同步日志和状态追踪

## 架构说明

### S3 → GitHub 同步
- AWS Lambda函数监控S3 `s3://rock-service-data/config/staging/test.json` 文件变化
- 当文件创建、更新或删除时，自动同步到GitHub仓库的staging分支

### GitHub → S3 同步  
- GitHub Actions工作流监控仓库中`test.json`文件变化
- 当文件提交到staging分支时，自动同步到S3对应位置

## 快速开始

### 1. 环境准备

```bash
# 克隆仓库
git clone https://github.com/s2265681/data-config-admin.git
cd data-config-admin

# 安装依赖
npm install
```

### 2. 配置环境变量

复制环境变量模板并配置：

```bash
cp env.example .env
```

编辑 `.env` 文件，填入以下信息：

```env
# AWS配置
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# GitHub配置  
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_REPO=s2265681/data-config-admin
GITHUB_BRANCH=staging

# S3配置
S3_BUCKET=rock-service-data
S3_KEY=config/staging/test.json
```

### 3. 部署AWS Lambda

```bash
# 安装Serverless Framework
npm install -g serverless

# 部署Lambda函数
npm run deploy
```

### 4. 配置GitHub Secrets

在GitHub仓库设置中添加以下Secrets：

- `AWS_ACCESS_KEY_ID`: AWS访问密钥ID
- `AWS_SECRET_ACCESS_KEY`: AWS访问密钥
- `GITHUB_TOKEN`: GitHub个人访问令牌

## 使用方法

### 手动同步

```bash
# 从S3同步到GitHub
npm run sync-to-github

# 从GitHub同步到S3  
npm run sync-to-s3
```

### 自动同步

系统会自动监控文件变化并触发同步：

1. **S3文件变化** → 自动同步到GitHub
2. **GitHub文件变化** → 自动同步到S3

## 文件结构

```
data-config-admin/
├── handlers/
│   └── s3-to-github.js      # S3到GitHub同步处理器
├── scripts/
│   ├── sync-to-github.js    # GitHub同步脚本
│   └── sync-to-s3.js        # S3同步脚本
├── .github/workflows/
│   └── github-to-s3-sync.yml # GitHub Actions工作流
├── serverless.yml           # Serverless配置
├── package.json             # 项目依赖
├── test.json               # 配置文件
└── README.md               # 项目说明
```

## 配置说明

### S3配置
- **Bucket**: `rock-service-data`
- **路径**: `config/staging/test.json`
- **监控事件**: 文件创建、更新、删除

### GitHub配置
- **仓库**: `s2265681/data-config-admin`
- **分支**: `staging`
- **文件**: `test.json`

## 故障排除

### 常见问题

1. **同步失败**
   - 检查环境变量配置
   - 验证AWS和GitHub权限
   - 查看CloudWatch日志

2. **权限错误**
   - 确保AWS IAM角色有S3读写权限
   - 验证GitHub Token有仓库写入权限

3. **循环同步**
   - 系统已内置内容校验机制
   - 相同内容不会重复同步

### 日志查看

```bash
# 查看Lambda日志
serverless logs -f s3ToGithubSync

# 查看GitHub Actions日志
# 在GitHub仓库的Actions页面查看
```

## 开发指南

### 添加新文件监控

1. 修改 `serverless.yml` 中的S3事件规则
2. 更新Lambda处理器中的文件过滤逻辑
3. 调整GitHub Actions的路径过滤

### 扩展同步逻辑

- 在 `handlers/` 目录添加新的处理器
- 在 `scripts/` 目录添加新的同步脚本
- 更新工作流配置

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

---

**注意**: 请确保在生产环境中使用适当的权限和安全配置。




1、 管理 当前文件中的配置文件， 当配置文件触发时， 会自动同步到配置中心



2、 当test.json 对应 s3 的 s3://rock-service-data/config/  当staging 文件发生变化， 同步到 staging 分支， production 中文件发生变化， 同步 main 分支


## 测试阶段
手动上传 test.json

aws s3 cp test.json s3://rock-service-data/config/staging/test.json

查看日志
npx serverless logs -f s3ToGithubSync --tail