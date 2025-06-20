const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

exports.handler = async (event) => {
  console.log('S3多文件事件触发:', JSON.stringify(event, null, 2));
  
  try {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const eventName = record.eventName;
      
      console.log(`处理S3事件: ${eventName}, Bucket: ${bucket}, Key: ${key}`);
      
      // 提取文件名
      const fileName = extractFileName(key);
      if (!fileName) {
        console.log('跳过非配置文件:', key);
        continue;
      }
      
      if (eventName.startsWith('ObjectCreated')) {
        await syncS3ToGithubMulti(bucket, key, fileName);
      } else if (eventName.startsWith('ObjectRemoved')) {
        await removeFromGithubMulti(key, fileName);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: '多文件同步完成' })
    };
  } catch (error) {
    console.error('多文件同步失败:', error);
    throw error;
  }
};

function extractFileName(s3Key) {
  // 从S3 key中提取文件名
  // 例如: config/staging/test2.json -> test2.json
  const parts = s3Key.split('/');
  const fileName = parts[parts.length - 1];
  
  // 检查是否是JSON文件
  if (fileName && fileName.endsWith('.json')) {
    return fileName;
  }
  return null;
}

async function syncS3ToGithubMulti(bucket, key, fileName) {
  try {
    console.log(`🔄 开始同步文件: ${fileName} (${key})`);
    
    // 从S3获取文件内容和元数据
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Response = await s3Client.send(getObjectCommand);
    const fileContent = await streamToString(s3Response.Body);
    
    // 检查文件来源，避免循环同步
    const metadata = s3Response.Metadata || {};
    const syncedFrom = metadata['synced-from'];
    
    // 如果文件是从GitHub同步过来的，跳过同步回GitHub
    if (syncedFrom && (syncedFrom.includes('github') || syncedFrom.includes('main') || syncedFrom.includes('staging'))) {
      console.log(`⏭️  跳过同步: ${fileName} 来源为GitHub (${syncedFrom})，避免循环同步`);
      return;
    }
    
    // 获取环境信息
    const environment = key.includes('/production/') ? 'production' : 'staging';
    const branch = environment === 'production' ? 'main' : 'staging';
    
    // 获取GitHub仓库信息
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    
    // 构建GitHub文件路径（在configuration文件夹中）
    const githubFilePath = `configuration/${fileName}`;
    
    // 检查文件是否已存在
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: githubFilePath,
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
      console.log(`⏭️  ${fileName} 内容未变化，跳过更新`);
      return;
    }
    
    // 生成详细的提交信息
    const commitMessage = generateCommitMessage(fileName, key, environment, metadata);
    
    // 更新GitHub文件
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: githubFilePath,
      message: commitMessage,
      content: contentBuffer.toString('base64'),
      branch: branch,
      sha: currentFile ? currentFile.sha : undefined
    });
    
    console.log(`✅ 成功同步 ${fileName} 到GitHub ${branch}分支`);
    console.log(`📝 提交信息: ${commitMessage}`);
    
  } catch (error) {
    console.error(`❌ 同步 ${fileName} 失败:`, error);
    throw error;
  }
}

async function removeFromGithubMulti(key, fileName) {
  try {
    console.log(`🗑️  开始删除文件: ${fileName} (${key})`);
    
    // 获取环境信息
    const environment = key.includes('/production/') ? 'production' : 'staging';
    const branch = environment === 'production' ? 'main' : 'staging';
    
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    
    // 构建GitHub文件路径（在configuration文件夹中）
    const githubFilePath = `configuration/${fileName}`;
    
    // 检查文件是否存在
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: githubFilePath,
        ref: branch
      });
      currentFile = response.data;
    } catch (error) {
      if (error.status === 404) {
        console.log(`⏭️  GitHub中 ${fileName} 不存在，无需删除`);
        return;
      }
      throw error;
    }
    
    // 删除GitHub文件
    const commitMessage = `🗑️ [${environment.toUpperCase()}] 删除文件: ${fileName} - ${new Date().toISOString()}`;
    
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: githubFilePath,
      message: commitMessage,
      branch: branch,
      sha: currentFile.sha
    });
    
    console.log(`✅ 成功从GitHub ${branch}分支删除 ${fileName}`);
    console.log(`📝 提交信息: ${commitMessage}`);
    
  } catch (error) {
    console.error(`❌ 删除 ${fileName} 失败:`, error);
    throw error;
  }
}

function generateCommitMessage(fileName, s3Key, environment, metadata) {
  const envLabel = environment === 'production' ? 'PRODUCTION' : 'STAGING';
  const timestamp = new Date().toISOString();
  
  let message = `🔄 [${envLabel}] S3同步到GitHub: ${fileName}`;
  message += `\n\n📁 S3路径: ${s3Key}`;
  message += `\n📂 GitHub路径: configuration/${fileName}`;
  message += `\n⏰ 同步时间: ${timestamp}`;
  
  if (metadata) {
    if (metadata['synced-from']) {
      message += `\n🔄 来源: ${metadata['synced-from']}`;
    }
    if (metadata['file-hash']) {
      message += `\n🔐 文件哈希: ${metadata['file-hash'].substring(0, 8)}...`;
    }
  }
  
  return message;
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
} 