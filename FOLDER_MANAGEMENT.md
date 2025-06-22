# 文件夹管理功能使用指南

## 📋 概述

为了解决配置文件过多时管理困难的问题，我们引入了基于文件夹的配置管理功能。这个功能允许您通过配置声明来管理不同文件夹，让本地文件夹结构与S3目录结构保持一致。

## 🏗️ 架构设计

### 新的文件夹结构
```
app-config/
├── config/              # 主要配置文件
│   └── test.json
├── config2/             # 次要配置文件
│   ├── test2.json
│   └── test3.json
└── config3/             # 第三方配置文件
    └── test4.json
```

### S3目录结构
```
s3://bucket/
├── config/
│   ├── staging/
│   │   └── test.json
│   └── production/
│       └── test.json
├── config2/
│   ├── staging/
│   │   ├── test2.json
│   │   └── test3.json
│   └── production/
│       ├── test2.json
│       └── test3.json
└── config3/
    ├── staging/
    │   └── test4.json
    └── production/
        └── test4.json
```

## 📁 配置文件

### `config/folders.json` - 文件夹配置
```json
{
  "folders": [
    {
      "name": "config",
      "description": "主要配置文件",
      "local_path": "app-config/config",
      "s3_prefix_staging": "config/staging",
      "s3_prefix_production": "config/production",
      "files": [
        {
          "name": "test.json",
          "description": "主要配置文件"
        }
      ]
    },
    {
      "name": "config3",
      "description": "第三方配置文件", 
      "local_path": "app-config/config3",
      "s3_prefix_staging": "config3/staging",
      "files": [
        {
          "name": "test4.json",
          "description": "第四个配置文件"
        }
      ]
    }
  ],
  "environments": {
    "staging": {
      "github_branch": "staging"
    },
    "production": {
      "github_branch": "main"
    }
  }
}
```

### 🔍 监控配置说明

Lambda 函数会根据 `config/folders.json` 中的配置来决定监控哪些路径：

1. **环境监控控制**：
   - 如果配置了 `s3_prefix_staging`，则监控 staging 环境
   - 如果配置了 `s3_prefix_production`，则监控 production 环境
   - 如果某个环境没有配置前缀，则不会监控该环境

2. **示例**：
   - `config` 文件夹：配置了 staging 和 production，两个环境都会被监控
   - `config3` 文件夹：只配置了 staging，只有 staging 环境会被监控，production 环境会被跳过

3. **监控逻辑**：
   - 只有 JSON 文件会被监控
   - 文件必须在对应文件夹的 `files` 配置中
   - 路径必须匹配配置的前缀格式

## 🚀 快速开始

### 1. 迁移现有配置
```bash
# 运行迁移脚本
npm run migrate-to-folders
```

这个脚本会：
- 验证文件夹配置
- 创建新的文件夹结构
- 迁移现有文件到新结构
- 备份旧的配置文件
- 生成兼容性配置

### 2. 验证迁移结果
```bash
# 生成文件夹结构报告
npm run manage-folders report
```

### 3. 使用新的同步功能
```bash
# 基于文件夹的同步
npm run sync-folders-to-s3
```

## 📋 管理命令

### 文件夹管理工具
```bash
# 查看帮助
npm run manage-folders

# 生成报告
npm run manage-folders report

# 创建文件夹结构
npm run manage-folders create-structure

# 迁移文件
npm run manage-folders migrate

# 验证配置
npm run manage-folders validate

# 列出所有文件夹
npm run manage-folders list

# 列出指定文件夹中的文件
npm run manage-folders list-files config
```

### 添加新文件夹
```bash
# 添加新文件夹
npm run manage-folders add-folder "database" "数据库配置" "db-config"
```

### 添加新文件
```bash
# 添加新文件到指定文件夹
npm run manage-folders add-file "database" "mysql.json" "MySQL数据库配置"
```

## 🔧 核心功能

### 1. 文件夹管理器 (`utils/folder-manager.js`)
- **配置加载**: 加载和管理文件夹配置
- **文件操作**: 读取、写入、验证文件
- **哈希计算**: 计算文件哈希值用于变更检测
- **结构管理**: 创建和管理文件夹结构
- **迁移支持**: 支持从旧结构迁移到新结构

### 2. 智能同步 (`scripts/sync-folders-to-s3.js`)
- **文件夹遍历**: 按文件夹组织同步文件
- **变更检测**: 只同步发生变化的文件
- **详细日志**: 提供详细的同步日志
- **错误处理**: 完善的错误处理机制

### 3. 迁移工具 (`scripts/migrate-to-folders.js`)
- **自动迁移**: 自动迁移现有文件到新结构
- **配置验证**: 验证迁移后的配置
- **备份机制**: 自动备份旧配置
- **兼容性**: 生成兼容性配置文件

## 📊 使用示例

### 示例1: 添加数据库配置文件夹
```bash
# 1. 添加数据库配置文件夹
npm run manage-folders add-folder "database" "数据库配置" "db-config"

# 2. 添加MySQL配置文件
npm run manage-folders add-file "database" "mysql.json" "MySQL数据库配置"

# 3. 添加PostgreSQL配置文件
npm run manage-folders add-file "database" "postgresql.json" "PostgreSQL数据库配置"

# 4. 同步到S3
npm run sync-folders-to-s3
```

### 示例2: 添加API配置文件夹
```bash
# 1. 添加API配置文件夹
npm run manage-folders add-folder "api" "API配置" "api-config"

# 2. 添加用户服务配置
npm run manage-folders add-file "api" "user-service.json" "用户服务配置"

# 3. 添加订单服务配置
npm run manage-folders add-file "api" "order-service.json" "订单服务配置"

# 4. 同步到S3
npm run sync-folders-to-s3
```

## 🔍 监控和报告

### 生成文件夹报告
```bash
npm run manage-folders report
```

输出示例：
```
📊 文件夹结构报告:
==================

📁 config (主要配置文件)
   本地路径: app-config/config
   S3前缀: config
   文件数量: 1
   文件列表:
     ✅ test.json - 主要配置文件

📁 config2 (次要配置文件)
   本地路径: app-config/config2
   S3前缀: config2
   文件数量: 2
   文件列表:
     ✅ test2.json - 第二个配置文件
     ✅ test3.json - 第三个配置文件

✅ 配置验证通过
```

### 列出文件夹内容
```bash
npm run manage-folders list-files config
```

输出示例：
```
📄 文件夹 config 中的文件:
========================
   ✅ test.json - 主要配置文件
```

## 🛡️ 安全特性

### 1. 配置验证
- 检查文件夹名称唯一性
- 检查S3前缀唯一性
- 检查文件名称唯一性
- 验证JSON格式

### 2. 备份机制
- 自动备份旧配置文件
- 生成兼容性配置文件
- 支持回滚操作

### 3. 错误处理
- 详细的错误信息
- 优雅的错误处理
- 操作日志记录

## �� 迁移流程

### 迁移前
```
app-config/
├── test.json
├── test2.json
├── test3.json
└── test4.json
```

### 迁移后
```
app-config/
├── config/
│   └── test.json
├── config2/
│   ├── test2.json
│   └── test3.json
└── config3/
    └── test4.json
```

### 迁移步骤
1. **备份**: 自动备份现有配置
2. **验证**: 验证新的文件夹配置
3. **创建**: 创建新的文件夹结构
4. **迁移**: 移动文件到新位置
5. **验证**: 验证迁移结果
6. **报告**: 生成迁移报告

## 📈 优势

### 1. 组织结构清晰
- 按功能分类管理配置文件
- 本地结构与S3结构保持一致
- 便于理解和维护

### 2. 扩展性强
- 支持动态添加文件夹
- 支持动态添加文件
- 配置驱动的管理方式

### 3. 操作简便
- 命令行工具支持
- 自动化迁移流程
- 详细的帮助信息

### 4. 兼容性好
- 保持与现有系统的兼容性
- 支持渐进式迁移
- 向后兼容的API

## 🔧 故障排除

### 常见问题

#### 1. 文件夹配置验证失败
```bash
# 检查配置
npm run manage-folders validate
```

#### 2. 文件迁移失败
```bash
# 重新创建文件夹结构
npm run manage-folders create-structure

# 重新迁移文件
npm run manage-folders migrate
```

#### 3. 同步失败
```bash
# 检查文件是否存在
npm run manage-folders list-files <folder-name>

# 验证配置
npm run manage-folders validate
```

## 📚 相关文件

- `config/folders.json` - 文件夹配置
- `utils/folder-manager.js` - 文件夹管理器
- `scripts/migrate-to-folders.js` - 迁移脚本
- `scripts/sync-folders-to-s3.js` - 同步脚本
- `scripts/manage-folders.js` - 管理工具

这个文件夹管理功能为您的配置文件管理提供了更好的组织结构，让您可以更轻松地管理大量的配置文件。 