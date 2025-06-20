const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const FileManager = require('../utils/file-manager');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function monitorMultiFiles() {
  const fileManager = new FileManager();
  const bucket = process.env.S3_BUCKET || 'rock-service-data';
  const [owner, repo] = (process.env.GITHUB_REPO || 's2265681/data-config-admin').split('/');
  
  console.log('🔍 开始监控多文件同步状态...\n');
  
  const files = fileManager.getFiles();
  const results = {
    staging: {},
    production: {}
  };

  for (const file of files) {
    const fileName = file.name;
    const shortName = fileManager.getFileName(fileName); // 获取短文件名
    console.log(`📁 检查文件: ${shortName} (${fileName})`);
    
    // 检查本地文件
    const localStatus = {
      exists: fileManager.fileExists(fileName),
      modified: null,
      hash: null,
      size: null
    };
    
    if (localStatus.exists) {
      localStatus.modified = fileManager.getFileModifiedTime(fileName);
      localStatus.hash = fileManager.getFileHash(fileName);
      localStatus.size = fileManager.readFile(fileName).length;
    }
    
    // 检查S3 staging文件
    const stagingS3Status = await checkS3File(bucket, file.staging_path);
    
    // 检查S3 production文件
    const productionS3Status = await checkS3File(bucket, file.production_path);
    
    // 检查GitHub staging文件
    const stagingGithubStatus = await checkGithubFile(owner, repo, fileName, 'staging');
    
    // 检查GitHub production文件
    const productionGithubStatus = await checkGithubFile(owner, repo, fileName, 'main');
    
    results.staging[fileName] = {
      local: localStatus,
      s3: stagingS3Status,
      github: stagingGithubStatus
    };
    
    results.production[fileName] = {
      local: localStatus,
      s3: productionS3Status,
      github: productionGithubStatus
    };
    
    console.log(`  ✅ 本地: ${localStatus.exists ? '存在' : '不存在'}`);
    console.log(`  ☁️  S3 Staging: ${stagingS3Status.exists ? '存在' : '不存在'}`);
    console.log(`  ☁️  S3 Production: ${productionS3Status.exists ? '存在' : '不存在'}`);
    console.log(`  🐙 GitHub Staging: ${stagingGithubStatus.exists ? '存在' : '不存在'}`);
    console.log(`  🐙 GitHub Production: ${productionGithubStatus.exists ? '存在' : '不存在'}`);
    console.log('');
  }
  
  // 分析同步状态
  console.log('📊 同步状态分析:');
  console.log('================');
  
  for (const file of files) {
    const fileName = file.name;
    const shortName = fileManager.getFileName(fileName);
    const staging = results.staging[fileName];
    const production = results.production[fileName];
    
    console.log(`\n📄 ${shortName}:`);
    
    // Staging环境分析
    const stagingSync = analyzeSyncStatus(staging, 'staging');
    console.log(`  🔄 Staging: ${stagingSync.status} - ${stagingSync.message}`);
    
    // Production环境分析
    const productionSync = analyzeSyncStatus(production, 'production');
    console.log(`  🚀 Production: ${productionSync.status} - ${productionSync.message}`);
  }
  
  // 显示需要同步的文件
  console.log('\n🔄 需要同步的文件:');
  console.log('==================');
  
  let hasChanges = false;
  for (const file of files) {
    const fileName = file.name;
    const shortName = fileManager.getFileName(fileName);
    const staging = results.staging[fileName];
    const production = results.production[fileName];
    
    if (staging.local.exists && (!staging.s3.exists || staging.local.hash !== staging.s3.hash)) {
      console.log(`  📤 ${shortName} → S3 Staging (本地有更新)`);
      hasChanges = true;
    }
    
    if (staging.s3.exists && (!staging.github.exists || staging.s3.hash !== staging.github.hash)) {
      console.log(`  📥 ${shortName} → GitHub Staging (S3有更新)`);
      hasChanges = true;
    }
  }
  
  if (!hasChanges) {
    console.log('  ✨ 所有文件都已同步');
  }
  
  console.log('\n📂 文件结构:');
  console.log('============');
  console.log('configuration/');
  for (const file of files) {
    const shortName = fileManager.getFileName(file.name);
    console.log(`  ├── ${shortName}`);
  }
}

async function checkS3File(bucket, key) {
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const result = await s3Client.send(headCommand);
    return {
      exists: true,
      size: result.ContentLength,
      modified: result.LastModified,
      hash: result.Metadata?.['file-hash'] || null
    };
  } catch (error) {
    if (error.name === 'NotFound') {
      return { exists: false };
    }
    throw error;
  }
}

async function checkGithubFile(owner, repo, fileName, branch) {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: fileName,
      ref: branch
    });
    
    return {
      exists: true,
      size: Buffer.from(response.data.content, 'base64').length,
      modified: response.data.updated_at,
      hash: response.data.sha
    };
  } catch (error) {
    if (error.status === 404) {
      return { exists: false };
    }
    throw error;
  }
}

function analyzeSyncStatus(fileStatus, environment) {
  const { local, s3, github } = fileStatus;
  
  if (!local.exists) {
    return { status: '⚠️', message: '本地文件不存在' };
  }
  
  if (!s3.exists && !github.exists) {
    return { status: '🆕', message: '需要初始同步' };
  }
  
  if (s3.exists && github.exists) {
    if (local.hash === s3.hash && s3.hash === github.hash) {
      return { status: '✅', message: '完全同步' };
    } else if (local.hash === s3.hash && s3.hash !== github.hash) {
      return { status: '🔄', message: 'S3需要同步到GitHub' };
    } else if (local.hash !== s3.hash && s3.hash === github.hash) {
      return { status: '🔄', message: '本地需要同步到S3' };
    } else {
      return { status: '⚠️', message: '文件不一致' };
    }
  }
  
  if (s3.exists && !github.exists) {
    return { status: '🔄', message: 'S3需要同步到GitHub' };
  }
  
  if (!s3.exists && github.exists) {
    return { status: '🔄', message: 'GitHub需要同步到S3' };
  }
  
  return { status: '❓', message: '未知状态' };
}

// 如果直接运行此脚本
if (require.main === module) {
  monitorMultiFiles().catch(console.error);
}

module.exports = { monitorMultiFiles }; 