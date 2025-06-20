# 快速设置指南

## 🚀 5分钟快速部署

### 1. 克隆仓库
```bash
git clone https://github.com/s2265681/data-config-admin.git
cd data-config-admin
```

### 2. 配置环境变量
```bash
cp env.example .env
```

编辑 `.env` 文件，填入你的配置：
```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_REPO=s2265681/data-config-admin
GITHUB_BRANCH=staging
S3_BUCKET=rock-service-data
S3_KEY=config/staging/test.json
```

### 3. 一键部署
```bash
./deploy.sh
```

### 4. 配置GitHub Secrets

在GitHub仓库设置 → Secrets and variables → Actions 中添加：

- `AWS_ACCESS_KEY_ID`: 你的AWS访问密钥ID
- `AWS_SECRET_ACCESS_KEY`: 你的AWS访问密钥
- `GITHUB_TOKEN`: GitHub个人访问令牌（自动提供）

### 5. 测试同步

#### 测试S3 → GitHub同步
```bash
# 上传文件到S3
aws s3 cp test.json s3://rock-service-data/config/staging/test.json
```

#### 测试GitHub → S3同步
```bash
# 修改test.json文件
echo '{"test": "data"}' > test.json
git add test.json
git commit -m "测试同步"
git push origin staging
```

## 🔧 手动部署步骤

如果自动部署失败，可以按以下步骤手动部署：

### 1. 安装依赖
```bash
npm install
npm install -g serverless
```

### 2. 部署Lambda函数
```bash
serverless deploy
```

### 3. 创建staging分支
```bash
git checkout -b staging
git push -u origin staging
git checkout main
```

## 📋 权限要求

### AWS权限
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::rock-service-data",
        "arn:aws:s3:::rock-service-data/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### GitHub权限
- `repo` 权限（完整仓库访问）
- 或者 `public_repo` 权限（如果是公开仓库）

## 🧪 验证部署

### 1. 检查Lambda函数
```bash
serverless info
```

### 2. 监控同步状态
```bash
npm run monitor
```

### 3. 查看日志
```bash
# Lambda日志
serverless logs -f s3ToGithubSync --tail

# GitHub Actions日志
# 访问 https://github.com/s2265681/data-config-admin/actions
```

## 🔍 故障排除

### 常见问题

1. **部署失败**
   ```bash
   # 检查AWS凭证
   aws sts get-caller-identity
   
   # 检查Serverless配置
   serverless config credentials --provider aws
   ```

2. **同步不工作**
   ```bash
   # 检查环境变量
   npm run monitor
   
   # 手动测试同步
   npm run sync-to-s3
   npm run sync-to-github
   ```

3. **权限错误**
   - 确保AWS IAM用户有足够权限
   - 检查GitHub Token是否有效
   - 验证S3 bucket是否存在

### 获取帮助

- 查看详细日志：`serverless logs -f s3ToGithubSync`
- 检查GitHub Actions：仓库Actions页面
- 运行监控脚本：`npm run monitor`

## 📞 支持

如果遇到问题，请：

1. 检查日志文件
2. 运行监控脚本
3. 查看GitHub Issues
4. 提交新的Issue描述问题 