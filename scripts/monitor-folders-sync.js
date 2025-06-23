const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const FolderManager = require('../utils/folder-manager');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });

async function monitorFoldersSync() {
  try {
    const folderManager = new FolderManager();
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    
    console.log('🔍 文件夹同步状态监控（仅本地 vs S3）\n');
    
    const folders = folderManager.getFolders();
    const results = {
      staging: {},
      production: {}
    };

    for (const folder of folders) {
      results.staging[folder.name] = {};
      results.production[folder.name] = {};
      
      for (const file of folder.files) {
        const fileName = file.name;
        // 检查本地文件
        const localStagingStatus = {
          exists: folderManager.fileExists(folder.name, fileName, 'staging'),
          modified: null,
          hash: null,
          size: null
        };
        const localProductionStatus = {
          exists: folderManager.fileExists(folder.name, fileName, 'production'),
          modified: null,
          hash: null,
          size: null
        };
        if (localStagingStatus.exists) {
          try {
            localStagingStatus.modified = folderManager.getFileModifiedTime(folder.name, fileName, 'staging');
            localStagingStatus.hash = folderManager.getFileHash(folder.name, fileName, 'staging');
            localStagingStatus.size = folderManager.readFile(folder.name, fileName, 'staging').length;
          } catch (error) {}
        }
        if (localProductionStatus.exists) {
          try {
            localProductionStatus.modified = folderManager.getFileModifiedTime(folder.name, fileName, 'production');
            localProductionStatus.hash = folderManager.getFileHash(folder.name, fileName, 'production');
            localProductionStatus.size = folderManager.readFile(folder.name, fileName, 'production').length;
          } catch (error) {}
        }
        // 检查S3文件
        const stagingS3Key = `${folder.s3_prefix_staging}/${fileName}`;
        const stagingS3Status = await checkS3File(bucket, stagingS3Key);
        const productionS3Key = `${folder.s3_prefix_production}/${fileName}`;
        const productionS3Status = await checkS3File(bucket, productionS3Key);
        results.staging[folder.name][fileName] = {
          local: localStagingStatus,
          s3: stagingS3Status
        };
        results.production[folder.name][fileName] = {
          local: localProductionStatus,
          s3: productionS3Status
        };
      }
    }
    // 显示同步状态摘要
    console.log('📊 同步状态摘要（本地 vs S3）');
    console.log('================');
    let needsSync = 0;
    for (const folder of folders) {
      let folderHasIssues = false;
      const folderIssues = [];
      for (const file of folder.files) {
        const fileName = file.name;
        const staging = results.staging[folder.name][fileName];
        const production = results.production[folder.name][fileName];
        // Staging环境分析（只比较本地和S3）
        if (staging.local.exists && staging.s3.exists) {
          if (staging.local.hash !== staging.s3.hash) {
            needsSync++;
            folderIssues.push(`  📄 ${fileName} (Staging): 本地和S3内容不一致`);
            folderHasIssues = true;
          }
        } else if (staging.local.exists && !staging.s3.exists) {
          needsSync++;
          folderIssues.push(`  📄 ${fileName} (Staging): S3不存在该文件`);
          folderHasIssues = true;
        } else if (!staging.local.exists && staging.s3.exists) {
          needsSync++;
          folderIssues.push(`  📄 ${fileName} (Staging): 本地不存在该文件`);
          folderHasIssues = true;
        }
        // Production环境分析（只比较本地和S3）
        if (production.local.exists && production.s3.exists) {
          if (production.local.hash !== production.s3.hash) {
            needsSync++;
            folderIssues.push(`  📄 ${fileName} (Production): 本地和S3内容不一致`);
            folderHasIssues = true;
          }
        } else if (production.local.exists && !production.s3.exists) {
          needsSync++;
          folderIssues.push(`  📄 ${fileName} (Production): S3不存在该文件`);
          folderHasIssues = true;
        } else if (!production.local.exists && production.s3.exists) {
          needsSync++;
          folderIssues.push(`  📄 ${fileName} (Production): 本地不存在该文件`);
          folderHasIssues = true;
        }
      }
      if (folderHasIssues) {
        console.log(`\n📁 ${folder.name} (${folder.description})`);
        folderIssues.forEach(issue => console.log(issue));
      }
    }
    if (needsSync === 0) {
      console.log('\n✨ 所有本地和S3文件都已同步！');
    }
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
    return { exists: false };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  monitorFoldersSync();
}

module.exports = { monitorFoldersSync }; 
module.exports = { monitorFoldersSync }; 