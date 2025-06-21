const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Octokit } = require('@octokit/rest');
const FolderManager = require('../utils/folder-manager');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function monitorFoldersSync() {
  try {
    const folderManager = new FolderManager();
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const [owner, repo] = (process.env.GITHUB_REPO || 's2265681/data-config-admin').split('/');
    
    console.log('🔍 开始监控文件夹同步状态...\n');
    
    const folders = folderManager.getFolders();
    const results = {
      staging: {},
      production: {}
    };

    for (const folder of folders) {
      console.log(`📁 检查文件夹: ${folder.name} (${folder.description})`);
      console.log(`   📂 本地路径: ${folder.local_path}`);
      console.log(`   ☁️  S3前缀: ${folder.s3_prefix}`);
      console.log('');
      
      results.staging[folder.name] = {};
      results.production[folder.name] = {};
      
      for (const file of folder.files) {
        const fileName = file.name;
        console.log(`   📄 检查文件: ${fileName}`);
        
        // 检查本地文件
        const localStatus = {
          exists: folderManager.fileExists(folder.name, fileName),
          modified: null,
          hash: null,
          size: null
        };
        
        if (localStatus.exists) {
          try {
            localStatus.modified = folderManager.getFileModifiedTime(folder.name, fileName);
            localStatus.hash = folderManager.getFileHash(folder.name, fileName);
            localStatus.size = folderManager.readFile(folder.name, fileName).length;
          } catch (error) {
            console.log(`      ⚠️  本地文件读取失败: ${error.message}`);
          }
        }
        
        // 检查S3 staging文件
        const stagingS3Key = `${folder.s3_prefix}/staging/${fileName}`;
        const stagingS3Status = await checkS3File(bucket, stagingS3Key);
        
        // 检查S3 production文件
        const productionS3Key = `${folder.s3_prefix}/production/${fileName}`;
        const productionS3Status = await checkS3File(bucket, productionS3Key);
        
        // 检查GitHub staging文件
        const stagingGithubPath = `${folder.local_path}/${fileName}`;
        const stagingGithubStatus = await checkGithubFile(owner, repo, stagingGithubPath, 'staging');
        
        // 检查GitHub production文件
        const productionGithubPath = `${folder.local_path}/${fileName}`;
        const productionGithubStatus = await checkGithubFile(owner, repo, productionGithubPath, 'main');
        
        results.staging[folder.name][fileName] = {
          local: localStatus,
          s3: stagingS3Status,
          github: stagingGithubStatus
        };
        
        results.production[folder.name][fileName] = {
          local: localStatus,
          s3: productionS3Status,
          github: productionGithubStatus
        };
        
        console.log(`      ✅ 本地: ${localStatus.exists ? '存在' : '不存在'}`);
        console.log(`      ☁️  S3 Staging: ${stagingS3Status.exists ? '存在' : '不存在'}`);
        console.log(`      ☁️  S3 Production: ${productionS3Status.exists ? '存在' : '不存在'}`);
        console.log(`      🐙 GitHub Staging: ${stagingGithubStatus.exists ? '存在' : '不存在'}`);
        console.log(`      🐙 GitHub Production: ${productionGithubStatus.exists ? '存在' : '不存在'}`);
        console.log('');
      }
      
      console.log(`📁 文件夹 ${folder.name} 检查完成\n`);
    }
    
    // 分析同步状态
    console.log('📊 文件夹同步状态分析:');
    console.log('========================');
    
    for (const folder of folders) {
      console.log(`\n📁 ${folder.name} (${folder.description}):`);
      
      for (const file of folder.files) {
        const fileName = file.name;
        const staging = results.staging[folder.name][fileName];
        const production = results.production[folder.name][fileName];
        
        console.log(`\n   📄 ${fileName}:`);
        
        // Staging环境分析
        const stagingSync = analyzeFolderSyncStatus(staging, 'staging');
        console.log(`      🔄 Staging: ${stagingSync.status} - ${stagingSync.message}`);
        
        // Production环境分析
        const productionSync = analyzeFolderSyncStatus(production, 'production');
        console.log(`      🚀 Production: ${productionSync.status} - ${productionSync.message}`);
      }
    }
    
    // 显示需要同步的文件
    console.log('\n🔄 需要同步的文件:');
    console.log('==================');
    
    let hasChanges = false;
    for (const folder of folders) {
      for (const file of folder.files) {
        const fileName = file.name;
        const staging = results.staging[folder.name][fileName];
        const production = results.production[folder.name][fileName];
        
        // 检查本地到S3的同步
        if (staging.local.exists && (!staging.s3.exists || staging.local.hash !== staging.s3.hash)) {
          console.log(`  📤 ${folder.name}/${fileName} → S3 Staging (本地有更新)`);
          hasChanges = true;
        }
        
        if (production.local.exists && (!production.s3.exists || production.local.hash !== production.s3.hash)) {
          console.log(`  📤 ${folder.name}/${fileName} → S3 Production (本地有更新)`);
          hasChanges = true;
        }
        
        // 检查S3到本地的同步
        if (staging.s3.exists && (!staging.local.exists || staging.s3.hash !== staging.local.hash)) {
          console.log(`  📥 ${folder.name}/${fileName} → 本地 (S3 Staging有更新)`);
          hasChanges = true;
        }
        
        if (production.s3.exists && (!production.local.exists || production.s3.hash !== production.local.hash)) {
          console.log(`  📥 ${folder.name}/${fileName} → 本地 (S3 Production有更新)`);
          hasChanges = true;
        }
      }
    }
    
    if (!hasChanges) {
      console.log('  ✨ 所有文件都已同步');
    }
    
    // 显示文件夹结构
    console.log('\n📂 文件夹结构:');
    console.log('==============');
    
    folders.forEach(folder => {
      console.log(`\n📁 ${folder.name}/`);
      folder.files.forEach(file => {
        console.log(`  ├── ${file.name}`);
      });
    });
    
  } catch (error) {
    console.error('❌ 监控失败:', error);
    process.exit(1);
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

async function checkGithubFile(owner, repo, filePath, branch) {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
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

function analyzeFolderSyncStatus(fileStatus, environment) {
  const { local, s3, github } = fileStatus;
  
  if (!local.exists && !s3.exists && !github.exists) {
    return { status: '🆕', message: '文件不存在于任何位置' };
  }
  
  if (local.exists && s3.exists && github.exists) {
    if (local.hash === s3.hash && s3.hash === github.hash) {
      return { status: '✅', message: '完全同步' };
    } else if (local.hash === s3.hash && s3.hash !== github.hash) {
      return { status: '🔄', message: 'S3需要同步到GitHub' };
    } else if (local.hash !== s3.hash && s3.hash === github.hash) {
      return { status: '🔄', message: '本地需要同步到S3' };
    } else if (local.hash === github.hash && local.hash !== s3.hash) {
      return { status: '🔄', message: '本地需要同步到S3' };
    } else {
      return { status: '⚠️', message: '文件不一致' };
    }
  }
  
  if (local.exists && s3.exists && !github.exists) {
    if (local.hash === s3.hash) {
      return { status: '🔄', message: 'S3需要同步到GitHub' };
    } else {
      return { status: '🔄', message: '本地需要同步到S3' };
    }
  }
  
  if (local.exists && !s3.exists && github.exists) {
    if (local.hash === github.hash) {
      return { status: '🔄', message: '本地需要同步到S3' };
    } else {
      return { status: '⚠️', message: '本地和GitHub不一致' };
    }
  }
  
  if (!local.exists && s3.exists && github.exists) {
    if (s3.hash === github.hash) {
      return { status: '🔄', message: 'S3需要同步到本地' };
    } else {
      return { status: '⚠️', message: 'S3和GitHub不一致' };
    }
  }
  
  if (local.exists && !s3.exists && !github.exists) {
    return { status: '🆕', message: '本地文件需要初始同步' };
  }
  
  if (!local.exists && s3.exists && !github.exists) {
    return { status: '🔄', message: 'S3文件需要同步到本地' };
  }
  
  if (!local.exists && !s3.exists && github.exists) {
    return { status: '🔄', message: 'GitHub文件需要同步到本地' };
  }
  
  return { status: '❓', message: '未知状态' };
}

// 如果直接运行此脚本
if (require.main === module) {
  monitorFoldersSync();
}

module.exports = { monitorFoldersSync }; 