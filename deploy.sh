#!/bin/bash

# Data Config Admin 部署脚本
# 用于部署AWS Lambda函数和配置GitHub Actions

set -e

echo "🚀 开始部署 Data Config Admin..."

# 检查环境变量
if [ ! -f ".env" ]; then
    echo "❌ 错误: 未找到 .env 文件"
    echo "请复制 env.example 为 .env 并配置环境变量"
    exit 1
fi

# 加载环境变量
source .env

# 检查必要的环境变量
required_vars=("AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" "GITHUB_TOKEN")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ 错误: 环境变量 $var 未设置"
        exit 1
    fi
done

echo "✅ 环境变量检查通过"

# 安装依赖
echo "📦 安装依赖..."
npm install

# 检查Serverless Framework
if ! command -v serverless &> /dev/null; then
    echo "📦 安装 Serverless Framework..."
    npm install -g serverless
fi

# 部署Lambda函数
echo "☁️ 部署AWS Lambda函数..."
npm run deploy

echo "✅ Lambda函数部署完成"

# 创建staging分支（如果不存在）
echo "🌿 检查GitHub分支..."
current_branch=$(git branch --show-current)
if [ "$current_branch" != "staging" ]; then
    echo "创建staging分支..."
    git checkout -b staging
    git push -u origin staging
    git checkout $current_branch
else
    echo "staging分支已存在"
fi

echo ""
echo "🎉 部署完成！"
echo ""
echo "📋 后续步骤："
echo "1. 在GitHub仓库设置中添加以下Secrets："
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo "   - GITHUB_TOKEN"
echo ""
echo "2. 测试同步功能："
echo "   - 修改 test.json 文件并推送到staging分支"
echo "   - 或上传文件到S3: s3://rock-service-data/config/staging/test.json"
echo ""
echo "3. 查看日志："
echo "   - AWS Lambda: serverless logs -f s3ToGithubSync"
echo "   - GitHub Actions: 在仓库Actions页面查看" 