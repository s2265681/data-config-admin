const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function monitorSync() {
  console.log('🔍 开始监控同步状态...\n');
  
  try {
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const key = process.env.S3_KEY || 'config/staging/test.json';
    const [owner, repo] = (process.env.GITHUB_REPO || 's2265681/data-config-admin').split('/');
    const branch = process.env.GITHUB_BRANCH || 'staging';
    
    // 检查S3文件状态
    console.log('📁 检查S3文件状态...');
    let s3Status = '❌ 不存在';
    let s3LastModified = null;
    let s3Size = null;
    
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      });
      
      const s3Result = await s3Client.send(headCommand);
      s3Status = '✅ 存在';
      s3LastModified = s3Result.LastModified;
      s3Size = s3Result.ContentLength;
    } catch (error) {
      if (error.name !== 'NotFound') {
        console.error('S3检查错误:', error.message);
      }
    }
    
    console.log(`   S3文件: ${s3Status}`);
    if (s3LastModified) {
      console.log(`   最后修改: ${s3LastModified.toISOString()}`);
      console.log(`   文件大小: ${s3Size} bytes`);
    }
    
    // 检查GitHub文件状态
    console.log('\n🐙 检查GitHub文件状态...');
    let githubStatus = '❌ 不存在';
    let githubLastModified = null;
    let githubSize = null;
    let githubSha = null;
    
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: 'test.json',
        ref: branch
      });
      
      githubStatus = '✅ 存在';
      githubLastModified = response.data.updated_at;
      githubSize = Buffer.from(response.data.content, 'base64').length;
      githubSha = response.data.sha;
    } catch (error) {
      if (error.status !== 404) {
        console.error('GitHub检查错误:', error.message);
      }
    }
    
    console.log(`   GitHub文件: ${githubStatus}`);
    if (githubLastModified) {
      console.log(`   最后修改: ${githubLastModified}`);
      console.log(`   文件大小: ${githubSize} bytes`);
      console.log(`   Commit SHA: ${githubSha}`);
    }
    
    // 检查本地文件状态
    console.log('\n💻 检查本地文件状态...');
    const localFilePath = path.join(process.cwd(), 'test.json');
    let localStatus = '❌ 不存在';
    let localLastModified = null;
    let localSize = null;
    
    if (fs.existsSync(localFilePath)) {
      localStatus = '✅ 存在';
      const stats = fs.statSync(localFilePath);
      localLastModified = stats.mtime;
      localSize = stats.size;
    }
    
    console.log(`   本地文件: ${localStatus}`);
    if (localLastModified) {
      console.log(`   最后修改: ${localLastModified.toISOString()}`);
      console.log(`   文件大小: ${localSize} bytes`);
    }
    
    // 同步状态分析
    console.log('\n📊 同步状态分析...');
    
    const s3Exists = s3Status === '✅ 存在';
    const githubExists = githubStatus === '✅ 存在';
    const localExists = localStatus === '✅ 存在';
    
    if (s3Exists && githubExists && localExists) {
      console.log('   🟢 所有位置都有文件，系统正常');
    } else if (!s3Exists && !githubExists && !localExists) {
      console.log('   🟡 所有位置都没有文件，需要初始化');
    } else {
      console.log('   🟠 文件分布不均匀，可能需要同步');
      
      if (!s3Exists) console.log('   - S3缺少文件');
      if (!githubExists) console.log('   - GitHub缺少文件');
      if (!localExists) console.log('   - 本地缺少文件');
    }
    
    // 检查Lambda函数状态
    console.log('\n⚡ 检查Lambda函数状态...');
    console.log('   请运行以下命令查看Lambda日志:');
    console.log('   serverless logs -f s3ToGithubSync --tail');
    
    // 检查GitHub Actions状态
    console.log('\n🔄 检查GitHub Actions状态...');
    console.log('   请访问以下链接查看Actions:');
    console.log(`   https://github.com/${owner}/${repo}/actions`);
    
  } catch (error) {
    console.error('监控过程中发生错误:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  monitorSync();
}

module.exports = { monitorSync }; 