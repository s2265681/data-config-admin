# Data Config Admin - 脚本使用文档

## 📋 概述

Data Config Admin 是一个基于文件夹的配置文件管理系统，支持在 AWS S3 和本地文件夹之间进行双向同步。本文档介绍所有可用的脚本命令及其使用方法。

## 🚀 核心命令

### 部署相关

#### `npm run deploy`
- **功能**: 标准 Serverless 部署
- **用途**: 部署整个项目到 AWS
- **示例**: 
  ```bash
  npm run deploy
  ```

#### `npm run deploy-with-validation`
- **功能**: 带配置验证的部署
- **用途**: 部署前验证文件夹配置，确保配置正确
- **示例**: 
  ```bash
  npm run deploy-with-validation
  ```

#### `npm run update-lambda [function-name]`
- **功能**: 快速更新 Lambda 函数
- **参数**: 
  - `function-name` (可选): 要更新的函数名称，默认为 `s3ToGithubSync`
- **用途**: 只更新函数代码，不更新事件配置
- **示例**: 
  ```bash
  npm run update-lambda
  npm run update-lambda s3ToGithubSync
  ```

### 同步相关

#### `npm run sync-to-s3`
- **功能**: 将本地文件夹同步到 S3
- **用途**: 将 `configuration/` 目录下的文件按文件夹结构同步到 S3
- **特点**: 
  - 智能同步（只同步变更的文件）
  - 基于文件哈希比较
  - 支持多环境（staging/production）
- **示例**: 
  ```bash
  npm run sync-to-s3
  ```

#### `npm run sync-from-s3`
- **功能**: 从 S3 同步到本地文件夹
- **用途**: 将 S3 中的文件同步回本地 `configuration/` 目录
- **特点**: 
  - 保持文件夹结构
  - 覆盖本地文件
  - 详细日志输出
- **示例**: 
  ```bash
  npm run sync-from-s3
  ```

### 监控相关

#### `npm run monitor`
- **功能**: 监控文件夹同步状态
- **用途**: 检查本地文件夹和 S3 的同步状态
- **输出**: 
  - 文件存在性检查
  - 文件大小比较
  - 最后修改时间
  - 同步状态分析
- **示例**: 
  ```bash
  npm run monitor
  ```

### 管理相关

#### `npm run manage-folders`
- **功能**: 文件夹管理工具
- **用途**: 管理 `config/folders.json` 配置
- **功能**: 
  - 列出所有文件夹
  - 验证配置
  - 添加/删除文件夹
  - 添加/删除文件
- **示例**: 
  ```bash
  npm run manage-folders
  npm run manage-folders list
  npm run manage-folders validate
  npm run manage-folders add-folder
  npm run manage-folders add-file
  ```

#### `npm run migrate`
- **功能**: 迁移到文件夹结构
- **用途**: 从旧的单文件配置迁移到新的文件夹结构
- **注意**: 仅用于一次性迁移，日常使用不需要
- **示例**: 
  ```bash
  npm run migrate
  ```

## 📁 文件夹结构

```
configuration/
├── config/          # 配置文件夹1
│   ├── test.json
│   └── ...
├── config2/         # 配置文件夹2
│   ├── test2.json
│   ├── test3.json
│   └── ...
└── config3/         # 配置文件夹3
    ├── test4.json
    └── ...
```

## ⚙️ 配置文件

### `config/folders.json`
定义文件夹映射关系：

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
    }
  ]
}
```

## 🔄 工作流程

### 1. 初始设置
```bash
# 1. 验证配置
npm run manage-folders validate

# 2. 部署到 AWS
npm run deploy-with-validation
```

### 2. 日常同步
```bash
# 1. 本地修改文件后，同步到 S3
npm run sync-to-s3

# 2. 监控同步状态
npm run monitor

# 3. 如果需要从 S3 同步回本地
npm run sync-from-s3
```

### 3. 添加新文件
```bash
# 1. 使用管理工具添加文件
npm run manage-folders add-file

# 2. 同步到 S3
npm run sync-to-s3
```

## 🐛 故障排除

### 常见问题

1. **同步失败**
   ```bash
   # 检查 AWS 凭证
   aws sts get-caller-identity
   
   # 检查环境变量
   echo $AWS_REGION
   echo $S3_BUCKET
   ```

2. **配置验证失败**
   ```bash
   # 验证配置
   npm run manage-folders validate
   ```

3. **Lambda 函数问题**
   ```bash
   # 查看日志
   serverless logs -f s3ToGithubSync --tail
   
   # 更新函数
   npm run update-lambda
   ```

### 日志查看

```bash
# 查看 Lambda 日志
serverless logs -f s3ToGithubSync --tail

# 查看部署日志
serverless deploy --verbose
```

## 📊 监控和状态

### 同步状态检查
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

## 🔧 高级用法

### 环境变量配置

```bash
# AWS 配置
export AWS_REGION=ap-southeast-2
export S3_BUCKET=your-bucket-name

# GitHub 配置（如果需要）
export GITHUB_TOKEN=your-github-token
export GITHUB_REPO=owner/repo
```

### 自定义同步

可以通过修改 `config/folders.json` 来自定义：
- 文件夹映射关系
- S3 前缀路径
- 文件描述信息

## 📝 注意事项

1. **备份重要文件**: 同步操作会覆盖目标文件，请确保重要数据已备份
2. **权限检查**: 确保 AWS 凭证有足够的 S3 读写权限
3. **网络连接**: 确保网络连接稳定，避免同步中断
4. **配置验证**: 修改配置后务必运行验证命令

## 🆘 获取帮助

如果遇到问题，可以：

1. 查看详细日志输出
2. 运行配置验证命令
3. 检查 AWS 凭证和权限
4. 查看 Lambda 函数日志

---

*最后更新: 2024年* 