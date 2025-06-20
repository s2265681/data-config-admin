const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function syncToGithub() {
  try {
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const key = process.env.S3_KEY || 'config/staging/test.json';
    const [owner, repo] = (process.env.GITHUB_REPO || 's2265681/data-config-admin').split('/');
    const branch = process.env.GITHUB_BRANCH || 'staging';
    
    console.log(`开始从S3同步文件到GitHub: ${bucket}/${key}`);
    console.log(`使用区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
    
    // 从S3获取文件内容
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Response = await s3Client.send(getObjectCommand);
    const fileContent = await streamToString(s3Response.Body);
    
    // 检查本地文件是否存在
    const localFilePath = path.join(process.cwd(), 'test.json');
    let localContent = null;
    
    if (fs.existsSync(localFilePath)) {
      localContent = fs.readFileSync(localFilePath, 'utf8');
    }
    
    // 比较内容是否相同
    if (localContent === fileContent) {
      console.log('文件内容相同，无需同步');
      return;
    }
    
    // 更新本地文件
    fs.writeFileSync(localFilePath, fileContent);
    console.log('已更新本地文件');
    
    // 检查GitHub仓库中的文件
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: 'test.json',
        ref: branch
      });
      currentFile = response.data;
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
    
    // 计算文件内容的SHA
    const contentBuffer = Buffer.from(fileContent, 'utf8');
    const sha = crypto.createHash('sha1').update(contentBuffer).digest('hex');
    
    // 如果文件内容没有变化，跳过更新
    if (currentFile && currentFile.sha === sha) {
      console.log('GitHub中文件内容未变化，跳过更新');
      return;
    }
    
    // 更新GitHub文件
    const commitMessage = `Sync from S3: ${key} - ${new Date().toISOString()}`;
    
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'test.json',
      message: commitMessage,
      content: contentBuffer.toString('base64'),
      branch: branch,
      sha: currentFile ? currentFile.sha : undefined
    });
    
    console.log(`成功同步S3文件 ${key} 到GitHub`);
    
  } catch (error) {
    console.error('同步到GitHub失败:', error);
    process.exit(1);
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// 如果直接运行此脚本
if (require.main === module) {
  syncToGithub();
}

module.exports = { syncToGithub }; 