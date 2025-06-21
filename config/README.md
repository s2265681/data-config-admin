# 配置文件说明

## 📁 配置文件结构

本目录包含数据配置管理的核心配置文件：

### 1. `folders.json` - 文件夹配置（主要配置）

`folders.json` 是数据配置管理的核心配置文件，用于定义文件夹结构和文件映射关系。

#### 配置结构
```json
{
  "folders": [
    {
      "name": "config",
      "description": "主要配置文件",
      "local_path": "configuration/config",
      "s3_prefix": "config",
      "files": [
        {
          "name": "test.json",
          "description": "主要配置文件"
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
  },
  "monitoring": {
    "s3_paths": [
      {
        "prefix": "config/staging/",
        "suffix": ".json",
        "environment": "staging"
      }
    ]
  }
}
```

#### 文件夹定义

每个文件夹需要定义以下信息：

- **name**: 文件夹名称，用于标识
- **description**: 文件夹描述，说明用途
- **local_path**: 本地文件夹路径
- **s3_prefix**: S3路径前缀
- **files**: 文件夹中的文件列表

#### 文件定义

每个文件需要定义以下信息：

- **name**: 文件名（例如 test.json）
- **description**: 文件描述，说明用途

#### 环境配置

- **staging**: 测试环境配置
- **production**: 生产环境配置

#### 监控配置

在 monitoring 部分定义需要监控的 S3 路径：

- **prefix**: S3 路径的前缀
- **suffix**: S3 路径的后缀
- **environment**: 监控的环境

## 🔧 使用方式

### 1. 添加新文件夹
```bash
npm run manage-folders add-folder "database" "数据库配置" "db-config"
```

### 2. 添加新文件
```bash
npm run manage-folders add-file "database" "mysql.json" "MySQL数据库配置"
```

### 3. 查看文件夹结构
```bash
npm run manage-folders report
```

### 4. 验证配置
```bash
npm run manage-folders validate
```

## 📂 文件夹映射关系

```
本地文件夹结构:                    S3路径结构:
configuration/config/              config/staging/
├── test.json                     ├── test.json
configuration/config2/             config2/staging/
├── test2.json                    ├── test2.json
├── test3.json                    ├── test3.json
configuration/config3/             config3/staging/
└── test4.json                    └── test4.json
```

## 🚀 优势

1. **组织结构清晰**: 按功能分类管理配置文件
2. **扩展性强**: 支持动态添加文件夹和文件
3. **配置驱动**: 通过配置文件管理，无需修改代码
4. **兼容性好**: 保持与现有系统的兼容性


