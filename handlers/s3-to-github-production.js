const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

exports.handler = async (event) => {
  console.log('生产环境S3事件触发:', JSON.stringify(event, null, 2));
  
  try {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const eventName = record.eventName;
      
      console.log(`处理生产环境S3事件: ${eventName}, Bucket: ${bucket}, Key: ${key}`);
      
      // 只处理生产环境的test.json文件
      if (!key.endsWith('config/production/test.json')) {
        console.log('跳过非生产环境test.json文件');
        continue;
      }
      
      if (eventName.startsWith('ObjectCreated')) {
        await syncS3ToGithubProduction(bucket, key);
      } else if (eventName.startsWith('ObjectRemoved')) {
        await removeFromGithubProduction(key);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: '生产环境同步完成' })
    };
  } catch (error) {
    console.error('生产环境同步失败:', error);
    throw error;
  }
};

async function syncS3ToGithubProduction(bucket, key) {
  try {
    // 从S3获取文件内容
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Response = await s3Client.send(getObjectCommand);
    const fileContent = await streamToString(s3Response.Body);
    
    // 获取GitHub仓库信息
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    const branch = 'main'; // 生产环境同步到main分支
    
    // 检查文件是否已存在
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
      console.log('生产环境文件内容未变化，跳过更新');
      return;
    }
    
    // 更新GitHub文件
    const commitMessage = `[PRODUCTION] Sync from S3: ${key} - ${new Date().toISOString()}`;
    
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'test.json',
      message: commitMessage,
      content: contentBuffer.toString('base64'),
      branch: branch,
      sha: currentFile ? currentFile.sha : undefined
    });
    
    console.log(`✅ 成功同步生产环境S3文件 ${key} 到GitHub main分支`);
  } catch (error) {
    console.error('❌ 同步生产环境S3到GitHub失败:', error);
    throw error;
  }
}

async function removeFromGithubProduction(key) {
  try {
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    const branch = 'main';
    
    // 检查文件是否存在
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
      if (error.status === 404) {
        console.log('GitHub中文件不存在，无需删除');
        return;
      }
      throw error;
    }
    
    // 删除GitHub文件
    const commitMessage = `[PRODUCTION] Remove file: ${key} - ${new Date().toISOString()}`;
    
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: 'test.json',
      message: commitMessage,
      branch: branch,
      sha: currentFile.sha
    });
    
    console.log(`✅ 成功从GitHub main分支删除生产环境文件 ${key}`);
  } catch (error) {
    console.error('❌ 从GitHub删除生产环境文件失败:', error);
    throw error;
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