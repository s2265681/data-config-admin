const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const FolderManager = require('../utils/folder-manager');
const crypto = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

exports.handler = async (event) => {
  console.log('生产环境S3到GitHub同步事件触发:', JSON.stringify(event, null, 2));
  try {
    const folderManager = new FolderManager();
    const validation = folderManager.validateFoldersConfig();
    if (!validation.isValid) {
      console.error('配置验证失败:', validation.errors);
      throw new Error('配置验证失败');
    }
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const eventName = record.eventName;
      console.log(`处理生产环境S3事件: ${eventName}, Bucket: ${bucket}, Key: ${key}`);
      // 只处理production环境的监控路径
      const pathInfo = isProductionPathMonitored(key, folderManager);
      if (!pathInfo.monitored) {
        console.log(`跳过非生产监控路径: ${key}`);
        continue;
      }
      const fileInfo = extractFileInfo(key, folderManager);
      if (!fileInfo) {
        console.log('跳过非配置文件:', key);
        continue;
      }
      if (eventName.startsWith('ObjectCreated') || eventName.startsWith('ObjectModified')) {
        await syncS3ToGithubProduction(bucket, key, fileInfo, pathInfo, folderManager);
      } else if (eventName.startsWith('ObjectRemoved')) {
        await removeFromGithubProduction(fileInfo, pathInfo, folderManager);
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ message: '生产环境S3到GitHub同步完成' })
    };
  } catch (error) {
    console.error('生产环境S3到GitHub同步失败:', error);
    throw error;
  }
};

function isProductionPathMonitored(s3Key, folderManager) {
  const parts = s3Key.split('/');
  if (parts.length < 3) return { monitored: false };
  const s3Prefix = parts[0];
  const environment = parts[1];
  const fileName = parts[2];
  if (environment !== 'production' || !fileName.endsWith('.json')) return { monitored: false };
  const folder = folderManager.getFolders().find(f => {
    const productionPrefix = f.s3_prefix_production;
    const productionBase = productionPrefix ? productionPrefix.split('/')[0] : null;
    return productionBase === s3Prefix;
  });
  if (!folder) return { monitored: false };
  const productionPrefix = folder.s3_prefix_production;
  if (!productionPrefix) return { monitored: false };
  const fileConfig = folder.files.find(f => f.name === fileName);
  if (!fileConfig) return { monitored: false };
  const expectedPrefix = productionPrefix;
  const actualPrefix = `${s3Prefix}/production`;
  if (expectedPrefix !== actualPrefix) return { monitored: false };
  return {
    monitored: true,
    environment: environment,
    prefix: `${s3Prefix}/production/`,
    folder: folder
  };
}

function extractFileInfo(s3Key, folderManager) {
  const parts = s3Key.split('/');
  if (parts.length < 3) return null;
  const s3Prefix = parts[0];
  const environment = parts[1];
  const fileName = parts[2];
  if (!fileName.endsWith('.json')) return null;
  const folder = folderManager.getFolders().find(f => {
    const productionPrefix = f.s3_prefix_production;
    const productionBase = productionPrefix ? productionPrefix.split('/')[0] : null;
    return productionBase === s3Prefix;
  });
  if (!folder) return null;
  const productionPrefix = folder.s3_prefix_production;
  if (environment === 'production' && !productionPrefix) return null;
  const fileConfig = folder.files.find(f => f.name === fileName);
  if (!fileConfig) return null;
  return {
    folder: folder,
    folderName: folder.name,
    fileName: fileName,
    environment: environment,
    description: fileConfig.description
  };
}

async function syncS3ToGithubProduction(bucket, key, fileInfo, pathInfo, folderManager) {
  try {
    console.log(`🔄 开始同步生产文件到GitHub: ${fileInfo.fileName}`);
    const getObjectCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const s3Response = await s3Client.send(getObjectCommand);
    const fileContent = await streamToString(s3Response.Body);
    const branch = 'main';
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    let githubFilePath;
    if (fileInfo.folder.local_path_production) {
      githubFilePath = `${fileInfo.folder.local_path_production}/${fileInfo.fileName}`;
    } else if (fileInfo.folder.local_path) {
      githubFilePath = `${fileInfo.folder.local_path}/${fileInfo.fileName}`;
    } else {
      throw new Error(`文件夹 ${fileInfo.folderName} 未配置 production 环境的本地路径`);
    }
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({ owner, repo, path: githubFilePath, ref: branch });
      currentFile = response.data;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    const contentBuffer = Buffer.from(fileContent, 'utf8');
    const sha = crypto.createHash('sha1').update(contentBuffer).digest('hex');
    if (currentFile && currentFile.sha === sha) {
      console.log(`⏭️  ${fileInfo.fileName} 内容未变化，跳过GitHub更新`);
      return;
    }
    const commitMessage = `[PRODUCTION] 从S3同步: ${fileInfo.fileName}`;
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: githubFilePath,
      message: commitMessage,
      content: contentBuffer.toString('base64'),
      branch: branch,
      sha: currentFile ? currentFile.sha : undefined
    });
    console.log(`✅ 成功同步生产环境 ${fileInfo.fileName} 到GitHub main分支`);
    console.log(`📝 提交信息: ${commitMessage}`);
  } catch (error) {
    console.error(`❌ 同步生产环境 ${fileInfo.fileName} 到GitHub失败:`, error);
    throw error;
  }
}

async function removeFromGithubProduction(fileInfo, pathInfo, folderManager) {
  try {
    console.log(`🗑️  开始从GitHub main分支删除生产文件: ${fileInfo.fileName}`);
    const branch = 'main';
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    let githubFilePath;
    if (fileInfo.folder.local_path_production) {
      githubFilePath = `${fileInfo.folder.local_path_production}/${fileInfo.fileName}`;
    } else if (fileInfo.folder.local_path) {
      githubFilePath = `${fileInfo.folder.local_path}/${fileInfo.fileName}`;
    } else {
      throw new Error(`文件夹 ${fileInfo.folderName} 未配置 production 环境的本地路径`);
    }
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({ owner, repo, path: githubFilePath, ref: branch });
      currentFile = response.data;
    } catch (error) {
      if (error.status === 404) {
        console.log(`📄 文件 ${fileInfo.fileName} 在GitHub main分支中不存在，无需删除`);
        return;
      }
      throw error;
    }
    const commitMessage = `[PRODUCTION] 从S3删除: ${fileInfo.fileName}`;
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: githubFilePath,
      message: commitMessage,
      branch: branch,
      sha: currentFile.sha
    });
    console.log(`✅ 成功从GitHub main分支删除生产环境文件: ${fileInfo.fileName}`);
    console.log(`📝 提交信息: ${commitMessage}`);
  } catch (error) {
    console.error(`❌ 从GitHub main分支删除生产环境文件 ${fileInfo.fileName} 失败:`, error);
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